import CoinGecko from "coingecko-api";
import fetch from "request-promise";
import { Client } from "@elastic/elasticsearch";
import { Worker, isMainThread } from "worker_threads";
import Ioredis from "ioredis";
require("dotenv").config();

const redis = new Ioredis(process.env.STACKHERO_REDIS_URL_TLS);

const CoinGeckoClient = new CoinGecko();
const client = new Client({ node: process.env.BONSAI_URL });
const perPage = 250;
let highPriority = 1;
const lowPriorityStart = 1000 / perPage + 1;
let lowPriority = lowPriorityStart;

const init = async () => {
  const list = await CoinGeckoClient.coins.list();
  const totalPages = Math.ceil(list.data.length / perPage);
  console.log(
    `Found ${list.data.length} total items. Total Pages: ${totalPages}`
  );

  const getPrices = async (page, perPage) => {
    try {
      const prices = await fetch(
        `https://crypto-keeper.io/_hcms/api/fetch-prices?page=${page}&perPage=${perPage}`,
        {
          method: "get",
        }
      );

      const transformedPrices = await fetch(
        "https://crypto-keeper.io/_hcms/api/transform-prices",
        {
          method: "post",
          // @ts-ignore
          body: JSON.stringify({
            prices: JSON.parse(prices).data,
            page,
            perPage,
          }),
          headers: { "Content-Type": "application/json" },
        }
      );

      return transformedPrices;
    } catch (e) {}
  };

  const forceMerge = async () => {
    console.log(`Force Merging - ${new Date().toLocaleTimeString()}`);
    return client.indices.forcemerge({
      index: "*",
      expand_wildcards: "all",
      max_num_segments: 1,
    });
  };

  const updateRedis = async (page, perPage) => {
    const prices: any = await getPrices(page, perPage);
    if (!prices) return;

    const data = JSON.parse(prices).data;
    const asSymbol = {};
    const asRank = {};
    data.forEach((doc) => {
      const stringifiedDoc = JSON.stringify(doc);
      asSymbol[doc.symbol] = stringifiedDoc;
      asRank[doc.rank] = stringifiedDoc;
    });

    console.log(
      `Updating Redis page ${page} - ${new Date().toLocaleTimeString()}`
    );
    await redis.hmset("crypto.symbol", asSymbol);
    await redis.hmset("crypto.rank", asRank);
  };

  const updateElasticSearch = async (page, perPage) => {
    try {
      const prices: any = await getPrices(page, perPage);
      if (!prices) return;

      const body = JSON.parse(prices).data.flatMap((doc) => [
        { index: { _index: "crypto", _id: doc.symbol } },
        doc,
      ]);

      console.log(
        `Updating ElasticSearch page ${page} - ${new Date().toLocaleTimeString()}`
      );
      await client.bulk({ body });
    } catch (e) {
      console.log(e.message);
    }
  };

  const highPriorityUpdate = async () => {
    if (highPriority === 1) {
      await forceMerge();
    }

    await updateRedis(highPriority, perPage);
    await updateElasticSearch(highPriority, perPage);
    highPriority++;
    if (highPriority >= lowPriorityStart) {
      highPriority = 1;
    }
  };

  const lowPriorityUpdate = async () => {
    if (lowPriority === lowPriorityStart) {
      await forceMerge();
    }

    await updateRedis(lowPriority, perPage);
    await updateElasticSearch(lowPriority, perPage);
    lowPriority++;
    if (lowPriority >= totalPages + 1) {
      lowPriority = lowPriorityStart;
    }
  };

  while (true) {
    try {
      await highPriorityUpdate();
      await highPriorityUpdate();
      await lowPriorityUpdate();
    } catch (e) {
      console.log(e.message);
    }
  }
};

if (isMainThread && !process.env.DEV) {
  const worker = new Worker(__filename);
} else {
  console.log("Running on child thread");
  init();
}
