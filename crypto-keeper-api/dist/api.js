"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCryptoCount = exports.fetchCryptosBySymbol = exports.fetchExchangeRates = exports.fetchPage = exports.search = exports.fetchPageold = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = require("dotenv");
const ioredis_1 = __importDefault(require("ioredis"));
dotenv_1.config();
const redis = new ioredis_1.default(process.env.STACKHERO_REDIS_URL_TLS);
const symbolCache = {};
const retrieveCachedSymbols = (symbols) => {
    const now = Date.now();
    const symbolsToFetch = [];
    const cachedSymbols = [];
    symbols.forEach((symbol) => {
        if (Date.now() < symbolCache[symbol]?.expire) {
            // @ts-ignore
            cachedSymbols.push(symbolCache[symbol].data);
        }
        else {
            // @ts-ignore
            symbolsToFetch.push(symbol);
        }
    });
    console.log(`Need to fetch ${symbolsToFetch.join(",")}`);
    console.log(
    // @ts-ignore
    `Returning cached symbols ${cachedSymbols.map((c) => c.symbol).join(",")}`);
    return {
        symbolsToFetch,
        cachedSymbols,
    };
};
const retrieveCachedSymbolsByRanks = (ranks) => {
    const ranksToFetch = [];
    const cachedRanks = [];
    ranks.forEach((rank) => {
        const match = Object.keys(symbolCache).find((s) => symbolCache[s].data.rank === rank && Date.now() < symbolCache[s].expire);
        if (match) {
            // @ts-ignore
            cachedRanks.push(symbolCache[match].data);
        }
        else {
            // @ts-ignore
            ranksToFetch.push(rank);
        }
    });
    console.log(`Need to fetch ${ranksToFetch.join(", ")}`);
    console.log(
    // @ts-ignore
    `Returning cache from ${cachedRanks.map((r) => r.rank).join(", ")}`);
    return { ranksToFetch, cachedRanks };
};
const updateSymbolCache = (data) => {
    const expire = Date.now() + 60000;
    data.forEach((d) => {
        try {
            symbolCache[d.symbol] = {
                expire,
                data: d,
            };
        }
        catch (e) {
            console.log(d);
        }
    });
};
exports.fetchPageold = async (page) => {
    const res = await axios_1.default.get(`${process.env.ELASTIC_SEARCH_URL}/_search`, {
        responseType: "json",
        headers: {
            "Content-Type": "application/json",
        },
        data: {
            size: 100,
            from: page * 100,
            sort: [
                { rank: "asc" },
                { market_cap: "desc" },
                { price: "desc" },
                "_score",
            ],
            query: {
                bool: {
                    must: [],
                    filter: [
                        {
                            match_all: {},
                        },
                    ],
                    should: [],
                    must_not: [],
                },
            },
        },
    });
    return res.data;
};
exports.search = async (column, query, operator = "or", min_score = 5) => {
    const res = await axios_1.default.get(`${process.env.ELASTIC_SEARCH_URL}/_search`, {
        responseType: "json",
        headers: {
            "Content-Type": "application/json",
        },
        data: {
            min_score,
            query: {
                match: {
                    [column]: { query, operator },
                },
            },
        },
    });
    return res.data;
};
exports.fetchPage = async (pageNumber) => {
    let pages = [];
    const base = pageNumber * 100;
    for (let i = 1; i <= 100; i++) {
        // @ts-ignore
        pages.push(i + base);
    }
    const { cachedRanks, ranksToFetch } = retrieveCachedSymbolsByRanks(pages);
    // @ts-ignore
    if (!ranksToFetch.length)
        return cachedRanks.sort((a, b) => a.rank - b.rank);
    const results = await redis.hmget("crypto.rank", ranksToFetch);
    const data = results.map((r) => JSON.parse(r)).filter((d) => !!d);
    updateSymbolCache(data);
    // @ts-ignore
    return [...cachedRanks, ...data].sort((a, b) => a.rank - b.rank);
};
// 60 minute cache
let exchangeRateCache = { data: null, expire: -1 };
exports.fetchExchangeRates = async () => {
    try {
        if (Date.now() < exchangeRateCache.expire) {
            return exchangeRateCache.data;
        }
        console.log("Updating Exchange Rates");
        console.log(process.env.EXCHANGE_RATE_URL);
        const res = await axios_1.default.get(process.env.EXCHANGE_RATE_URL);
        exchangeRateCache = {
            data: res.data,
            expire: Date.now() + 1000 * 60 * 60,
        };
        return res.data;
    }
    catch (e) {
        console.log("Error fetching exchange rates");
        console.log(e.message);
    }
};
// 30 second cache
exports.fetchCryptosBySymbol = async (symbols = []) => {
    if (!symbols.length)
        return [];
    const { cachedSymbols, symbolsToFetch } = retrieveCachedSymbols(symbols);
    if (!symbolsToFetch.length)
        return cachedSymbols;
    const results = await redis.hmget("crypto.symbol", symbolsToFetch);
    const data = results.map((r) => JSON.parse(r)).filter((d) => !!d);
    updateSymbolCache(data);
    return [...cachedSymbols, ...data];
};
// 60 minute cache
let cryptoCountCache = { data: { count: 0 }, expire: -1 };
exports.fetchCryptoCount = async () => {
    if (Date.now() < cryptoCountCache.expire) {
        return cryptoCountCache.data;
    }
    const count = await redis.hlen("crypto.rank");
    cryptoCountCache = {
        data: { count },
        expire: Date.now() + 1000 * 60 * 60,
    };
    return { count };
};
