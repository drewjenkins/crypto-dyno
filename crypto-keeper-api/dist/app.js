"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const api_1 = require("./api");
express_1.default()
    .use(body_parser_1.default.urlencoded({ extended: true }))
    .use(body_parser_1.default.json())
    .use(cors_1.default())
    .get("/api/ticker", async (req, res) => {
    try {
        const page = req.query.page;
        const response = await api_1.fetchPage(parseInt(page, 10));
        res.json(response);
    }
    catch (e) {
        res.json([]);
    }
})
    .get("/api/search", async (req, res) => {
    try {
        const { column, query, operator, min_score } = req.query;
        const response = await api_1.search(column, query, operator, min_score);
        res.json(response.hits);
    }
    catch (e) { }
})
    .get("/api/crypto", async (req, res) => {
    try {
        // @ts-ignore
        const symbols = req.query.symbols.split(",");
        const response = await api_1.fetchCryptosBySymbol(symbols);
        res.json(response);
    }
    catch (e) {
        console.log(e.message);
        res.json([]);
    }
})
    .get("/api/crypto-count", async (req, res) => {
    const response = await api_1.fetchCryptoCount();
    res.json(response);
})
    .get("/api/exchange-rates", async (req, res) => {
    const exchangeRates = await api_1.fetchExchangeRates();
    res.json(exchangeRates);
})
    .listen(process.env.PORT || 3001, () => console.log(`Listening on ${process.env.PORT || 3001}`));
