import axios from "axios";
import "dotenv/config.js";
import fs from "fs";
import * as cron from "node-cron";
import puppeteer from "puppeteer";
import { DataTypes, Sequelize } from "sequelize";
import { Telegraf } from "telegraf";
import { promisify } from "util";
const appendFileAsync = promisify(fs.appendFile);

async function logErrorToFile(message, error) {
  const logEntry = `[${new Date().toISOString()}] ${message}: ${error.stack}\n`;

  try {
    await appendFileAsync("error.log", logEntry);
    console.log("Error logged to file.");
  } catch (err) {
    console.error("Error writing to file:", err);
  }
}

async function catchUsdtPrice() {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto("https://tetherland.com/");
    await page.waitForSelector(".rightInfo");
    const usdtPrice = await page.$eval(".sc-d9bf1c01-0.byQCJu", (element) => {
      return element.textContent;
    });
    const numericString = usdtPrice.replace(/[^0-9]/g, "");
    const numericValue = parseInt(numericString, 10);
    const formattedValue = numericValue.toLocaleString();
    await browser.close();
    return formattedValue;
  } catch (err) {
    console.log(err);
  }
}

async function catchPrices(db) {
  try {
    const res = await axios.get(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=200",
      {
        headers: {
          "X-CMC_PRO_API_KEY": process.env.TOKEN,
        },
      }
    );
    const crypto = [];
    for (let i = 0; i < res.data.data.length; i++) {
      const coin = {
        id: res.data.data[i].id,
        name: res.data.data[i].name,
        symbol: res.data.data[i].symbol,
        price: res.data.data[i].quote.USD.price,
        volume_change_24h: res.data.data[i].quote.USD.volume_change_24h,
        percent_change_1h: res.data.data[i].quote.USD.percent_change_1h,
        percent_change_24h: res.data.data[i].quote.USD.percent_change_24h,
        percent_change_7d: res.data.data[i].quote.USD.percent_change_7d,
        percent_change_30d: res.data.data[i].quote.USD.percent_change_30d,
        percent_change_60d: res.data.data[i].quote.USD.percent_change_60d,
        percent_change_90d: res.data.data[i].quote.USD.percent_change_90d,
      };
      crypto.push(coin);
    }
    return crypto;
  } catch (err) {
    logErrorToFile("An error occurred", err);
  }
}

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "db.db",
});

const cryptos = sequelize.define("Cryptos", {
  crypto: { type: DataTypes.JSON },
});

await cryptos.sync();

// const price = await catchPrices();
// console.log(typeof price);
// await cryptos.create({ crypto: price });

const text = (cry) => {
  const btc = Number(cry[0].price.toFixed(0)).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const formattedBtc = btc.replace(".000", "");
  return `TEST MESSAGE
    💰 BTC     =  ${formattedBtc}
    💰 ETH     =  $${cry[1].price.toFixed(0)}
    💰 BNB     =  $${cry[2].price.toFixed(0)}
    ➖➖➖➖➖➖➖
    💰 SOL     =  $${cry[3].price.toFixed(2)}
    💰 DOT     =  $${cry[4].price.toFixed(2)}
    💰 ATOM  =  $${cry[5].price.toFixed(2)}
    💰 ARB     =   $${cry[6].price.toFixed(2)}
    ➖➖➖➖➖➖➖
    💰 XRP     =  $${cry[7].price.toFixed(2)}
    💰 ADA     =  $${cry[8].price.toFixed(2)}
    💰 DOGE  =  $${cry[9].price.toFixed(2)}
    💰 MATIC =  $${cry[10].price.toFixed(2)}
    ➖➖➖➖➖➖➖
    💰 TETHER = 
    `;
};

const coins = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "DOT",
  "ATOM",
  "ARB",
  "XRP",
  "ADA",
  "DOGE",
  "MATIC",
];

function cronJob() {
  cron.schedule("*/10 * * * *", async () => {
    const usdtPrice = await catchUsdtPrice();
    const price = await catchPrices();
    await cryptos.create({ crypto: price, usdt: usdtPrice });
    setTimeout(async () => {
      try {
        const list = [];
        const price = await cryptos.findOne({
          order: [["createdAt", "DESC"]],
        });
        for (let i = 0; i < coins.length; i++) {
          const cry = price.crypto.find((crypto) => crypto.symbol === coins[i]);
          if (cry !== undefined) {
            list.push({ symbol: cry.symbol, price: parseFloat(cry.price) });
          }
        }
        console.log(list);

        bot.telegram.sendMessage("-1001980653166", text(list));
      } catch (err) {
        logErrorToFile("An error occurred", err);
      }
    }, 10000);
    // bot.telegram.sendMessage("-1001980653166", text(usdt));
  });
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("Welcome"));
bot.help((ctx) => ctx.reply("Send me a sticker"));
bot.on("sticker", (ctx) => ctx.reply("👍"));
bot.hears("hi", (ctx) => ctx.reply("Hey there"));
cronJob();
bot.launch();
