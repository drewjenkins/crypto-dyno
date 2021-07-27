import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import {
  fetchExchangeRates,
  fetchPage,
  search,
  fetchCryptosBySymbol,
  fetchCryptoCount,
} from "./api";

express()
  .use(bodyParser.urlencoded({ extended: true }))
  .use(bodyParser.json())
  .use(cors())
  .get("/api/ticker", async (req, res) => {
    try {
      const page: any = req.query.page;
      const response = await fetchPage(parseInt(page, 10));
      res.json(response);
    } catch (e) {
      res.json([]);
    }
  })

  .get("/api/search", async (req, res) => {
    try {
      const { column, query, operator, min_score }: any = req.query;
      const response = await search(column, query, operator, min_score);
      res.json(response.hits);
    } catch (e) {}
  })
  .get("/api/crypto", async (req, res) => {
    try {
      // @ts-ignore
      const symbols: any = req.query.symbols.split(",");

      const response = await fetchCryptosBySymbol(symbols);
      res.json(response);
    } catch (e) {
      console.log(e.message);
      res.json([]);
    }
  })
  .get("/api/crypto-count", async (req, res) => {
    const response = await fetchCryptoCount();
    res.json(response);
  })
  .get("/api/exchange-rates", async (req, res) => {
    const exchangeRates = await fetchExchangeRates();
    res.json(exchangeRates);
  })
  .listen(process.env.PORT || 3001, () =>
    console.log(`Listening on ${process.env.PORT || 3001}`)
  );
