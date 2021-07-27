"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const socket_1 = __importDefault(require("./socket"));
const cors_1 = __importDefault(require("cors"));
const uniqBy_1 = __importDefault(require("lodash/uniqBy"));
const coingecko_api_1 = __importDefault(require("coingecko-api"));
const flatMap_1 = __importDefault(require("lodash/flatMap"));
const remove_1 = __importDefault(require("lodash/remove"));
const port = process.env.PORT || 3001;
const CoinGeckoClient = new coingecko_api_1.default();
let lastUpdated = -1;
let lastData;
const cacheLength = parseInt(process.env.CACHE_LENGTH, 10) || 30000;
const pollLength = parseInt(process.env.POLL_LENGTH, 10) || 30000;
const pageOverride = parseInt(process.env.PAGE_OVERRIDE, 10);
const blacklist = ["ong-social"];
const fetchTickerData = async () => {
    if (!!lastData && Date.now() - lastUpdated <= cacheLength) {
        return new Promise((res) => res(lastData));
    }
    const response = new Promise(async (outerRes) => {
        try {
            const list = await CoinGeckoClient.coins.list();
            const pages = 
            // Clamp to top 4000
            pageOverride || Math.min(Math.ceil(list.data.length / 250), 16);
            const calls = [];
            for (let i = 1; i <= pages; i++) {
                calls.push(
                // @ts-ignore
                new Promise((res, rej) => {
                    CoinGeckoClient.coins
                        .markets({
                        // @ts-ignore
                        price_change_percentage: "1h,24h,7d,30d,1y",
                        sparkline: true,
                        per_page: 250,
                        page: i,
                        vs_currency: "usd",
                    })
                        .then((d) => res(d.data))
                        .catch(() => rej());
                }));
            }
            Promise.all(calls)
                .then((values) => {
                const mapped = flatMap_1.default(values)
                    .sort((a, b) => b.market_cap_rank && a.market_cap_rank
                    ? a.market_cap_rank - b.market_cap_rank
                    : a.market_cap_rank
                        ? -1
                        : 1)
                    .map((d, i) => ({
                    currency: d.symbol.toUpperCase(),
                    id: d.symbol.toUpperCase(),
                    logo_url: d.image,
                    market_cap: d.market_cap ? `${d.market_cap}` : null,
                    name: d.id,
                    price: d.current_price ? `${d.current_price}` : null,
                    rank: `${d.market_cap_rank || i}`,
                    symbol: d.symbol.toUpperCase(),
                    sparkline: d.sparkline_in_7d,
                    "1h": {
                        price_change_pct: `${d.price_change_percentage_1h_in_currency * 0.01}`,
                        price_change: `${d.price_change_percentage_1h_in_currency *
                            0.01 *
                            d.current_price}`,
                    },
                    "1d": {
                        price_change_pct: `${d.price_change_percentage_24h_in_currency * 0.01}`,
                        price_change: `${d.price_change_percentage_24h_in_currency *
                            0.01 *
                            d.current_price}`,
                    },
                    "7d": {
                        price_change_pct: `${d.price_change_percentage_7d_in_currency * 0.01}`,
                        price_change: `${d.price_change_percentage_7d_in_currency *
                            0.01 *
                            d.current_price}`,
                    },
                    "30d": {
                        price_change_pct: `${d.price_change_percentage_30d_in_currency * 0.01}`,
                        price_change: `${d.price_change_percentage_30d_in_currency *
                            0.01 *
                            d.current_price}`,
                    },
                    "365d": {
                        price_change_pct: `${d.price_change_percentage_1y_in_currency * 0.01}`,
                        price_change: `${d.price_change_percentage_1y_in_currency *
                            0.01 *
                            d.current_price}`,
                    },
                    ytd: {
                        price_change_pct: d.price_change_percentage_200d_in_currency
                            ? `${d.price_change_percentage_200d_in_currency * 0.01}`
                            : null,
                        price_change: d.price_change_percentage_200d_in_currency
                            ? `${d.price_change_percentage_200d_in_currency *
                                0.01 *
                                d.current_price}`
                            : null,
                    },
                }));
                remove_1.default(mapped, (v) => blacklist.includes(v.name));
                // @ts-ignore
                return outerRes(uniqBy_1.default(mapped, "symbol"));
            })
                .catch((e) => {
                return lastData || [];
            });
        }
        catch (e) {
            return lastData || [];
        }
    });
    lastUpdated = Date.now();
    lastData = response;
    return response;
};
const updateTicker = async () => {
    try {
        const data = await fetchTickerData();
        sock.emitToAll("updateTicker", data);
    }
    catch (e) { }
};
const server = express_1.default()
    .use(body_parser_1.default.urlencoded({ extended: true }))
    .use(body_parser_1.default.json())
    .use(cors_1.default())
    .get("/api/ticker", async (req, res) => {
    const response = await fetchTickerData();
    res.json(response);
})
    .listen(port, () => console.log(`Listening on ${port}`));
const sock = new socket_1.default(server);
setInterval(updateTicker, pollLength);
updateTicker();
