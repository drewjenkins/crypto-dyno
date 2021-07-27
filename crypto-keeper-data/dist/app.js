"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const coingecko_api_1 = __importDefault(require("coingecko-api"));
const request_promise_1 = __importDefault(require("request-promise"));
const elasticsearch_1 = require("@elastic/elasticsearch");
const worker_threads_1 = require("worker_threads");
const CoinGeckoClient = new coingecko_api_1.default();
const client = new elasticsearch_1.Client({ node: process.env.BONSAI_URL });
const perPage = 250;
const maxPages = 20;
let highPriority = 1;
const lowPriorityStart = 1000 / perPage + 1;
let lowPriority = lowPriorityStart;
const init = async () => {
    const list = await CoinGeckoClient.coins.list();
    const totalPages = Math.min(Math.ceil(list.data.length / perPage), maxPages);
    const updatePage = async (page, perPage) => {
        try {
            const prices = await request_promise_1.default(`https://crypto-keeper.io/_hcms/api/fetch-prices?page=${page}&perPage=${perPage}`, {
                method: "get",
            });
            const transformedPrices = await request_promise_1.default("https://crypto-keeper.io/_hcms/api/transform-prices", {
                method: "post",
                // @ts-ignore
                body: JSON.stringify(JSON.parse(prices).data),
                headers: { "Content-Type": "application/json" },
            });
            const body = JSON.parse(transformedPrices).data.flatMap((doc) => [
                { index: { _index: "crypto", _id: doc.symbol } },
                doc,
            ]);
            console.log(`Updating - ${new Date().toLocaleTimeString()}`);
            await client.bulk({ body });
        }
        catch (e) {
            console.log(e.message);
        }
    };
    const highPriorityUpdate = async () => {
        await updatePage(highPriority, perPage);
        highPriority++;
        if (highPriority >= lowPriorityStart) {
            highPriority = 1;
        }
    };
    const lowPriorityUpdate = async () => {
        await updatePage(lowPriority, perPage);
        lowPriority++;
        if (lowPriority >= totalPages + 1) {
            lowPriority = lowPriorityStart;
            console.log(`Force Merging - ${new Date().toLocaleTimeString()}`);
            await client.indices.forcemerge({
                index: "*",
                expand_wildcards: "all",
                max_num_segments: 1,
            });
        }
    };
    while (true) {
        try {
            await highPriorityUpdate();
            await highPriorityUpdate();
            await lowPriorityUpdate();
        }
        catch (e) {
            console.log(e.message);
        }
    }
};
if (worker_threads_1.isMainThread) {
    const worker = new worker_threads_1.Worker(__filename);
}
else {
    console.log("Running on child thread");
    init();
}
