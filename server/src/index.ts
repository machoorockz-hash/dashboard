import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import pinoHttp from "pino-http";
import botRouter from "./routes/bot.js";
import binanceRouter from "./routes/binance.js";
import pumpRouter from "./routes/pump.js";
import delistRouter from "./routes/delist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "1mb" }));

app.use("/api", botRouter);
app.use("/api", binanceRouter);
app.use("/api", pumpRouter);
app.use("/api", delistRouter);

app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const clientDist = path.join(__dirname, "client");
app.use(express.static(clientDist));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "🚀 Binance Dashboard server listening");
});
