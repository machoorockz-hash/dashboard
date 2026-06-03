"""
Binance Dashboard - Flask API Server
Deploy on Render: https://render.com
"""

import os
import hmac
import hashlib
import time
import urllib.parse
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Serve React build from the 'static' folder
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

BINANCE_BASE = "https://api.binance.com"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_creds():
    """Read API key/secret from request headers first, then environment vars."""
    api_key = (request.headers.get("x-binance-api-key") or
               os.getenv("BINANCE_API_KEY", "")).strip()
    secret_key = (request.headers.get("x-binance-secret-key") or
                  os.getenv("BINANCE_SECRET_KEY", "")).strip()
    return api_key, secret_key


def _sign(secret_key: str, query_string: str) -> str:
    return hmac.new(
        secret_key.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def binance_get(path: str, params: dict = None, signed: bool = False):
    api_key, secret_key = get_creds()
    params = dict(params or {})

    if signed:
        params["timestamp"] = int(time.time() * 1000)
        params["recvWindow"] = 5000   # <-- FIX ADDED HERE
        query = urllib.parse.urlencode(params)
        query += "&signature=" + _sign(secret_key, query)
    else:
        query = urllib.parse.urlencode(params)

    url = f"{BINANCE_BASE}{path}" + (f"?{query}" if query else "")
    resp = requests.get(url, headers={"X-MBX-APIKEY": api_key}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def compute_usdt_value(asset: str, total: float, price_map: dict) -> float:
    if asset in ("USDT", "BUSD", "USDC"):
        return total
    usdt_pair = price_map.get(f"{asset}USDT")
    if usdt_pair:
        return total * float(usdt_pair)
    btc_pair = price_map.get(f"{asset}BTC")
    btc_usdt = price_map.get("BTCUSDT")
    if btc_pair and btc_usdt:
        return total * float(btc_pair) * float(btc_usdt)
    return 0.0


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route("/api/binance/balance")
def balance():
    try:
        account = binance_get("/api/v3/account", signed=True)
        all_prices = binance_get("/api/v3/ticker/price")

        price_map = {p["symbol"]: p["price"] for p in all_prices}

        balances = []
        total_usdt = 0.0

        for b in account["balances"]:
            total = float(b["free"]) + float(b["locked"])
            if total <= 0:
                continue
            usdt_val = compute_usdt_value(b["asset"], total, price_map)
            total_usdt += usdt_val
            balances.append({
                "asset": b["asset"],
                "free": b["free"],
                "locked": b["locked"],
                "total": f"{total:.8f}",
                "usdtValue": f"{usdt_val:.2f}",
            })

        filtered = [b for b in balances if float(b["usdtValue"]) >= 3]
        filtered.sort(key=lambda x: float(x["usdtValue"]), reverse=True)

        return jsonify({
            "balances": filtered,
            "totalUsdtValue": f"{total_usdt:.2f}",
            "updateTime": account.get("updateTime", 0),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/portfolio-summary")
def portfolio_summary():
    try:
        account = binance_get("/api/v3/account", signed=True)
        all_prices = binance_get("/api/v3/ticker/price")
        tickers_raw = binance_get("/api/v3/ticker/24hr")

        price_map = {p["symbol"]: p["price"] for p in all_prices}
        ticker_map = {t["symbol"]: t for t in (tickers_raw if isinstance(tickers_raw, list) else [])}

        total_usdt = 0.0
        prev_total_usdt = 0.0
        top_asset = ""
        top_asset_value = 0.0

        for b in account["balances"]:
            total = float(b["free"]) + float(b["locked"])
            if total <= 0:
                continue
            asset = b["asset"]
            usdt_val = 0.0
            prev_usdt_val = 0.0

            if asset in ("USDT", "BUSD", "USDC"):
                usdt_val = total
                prev_usdt_val = total
            else:
                usdt_pair_price = price_map.get(f"{asset}USDT")
                if usdt_pair_price:
                    usdt_val = total * float(usdt_pair_price)
                    ticker = ticker_map.get(f"{asset}USDT")
                    if ticker:
                        prev_price = float(usdt_pair_price) - float(ticker["priceChange"])
                        prev_usdt_val = total * prev_price
                    else:
                        prev_usdt_val = usdt_val
                else:
                    btc_pair = price_map.get(f"{asset}BTC")
                    btc_usdt = price_map.get("BTCUSDT")
                    if btc_pair and btc_usdt:
                        usdt_val = total * float(btc_pair) * float(btc_usdt)
                        prev_usdt_val = usdt_val

            total_usdt += usdt_val
            prev_total_usdt += prev_usdt_val

            if usdt_val > top_asset_value:
                top_asset_value = usdt_val
                top_asset = asset

        btc_price = float(price_map.get("BTCUSDT", "1") or 1)
        total_btc = total_usdt / btc_price
        change_24h = total_usdt - prev_total_usdt
        change_24h_pct = (change_24h / prev_total_usdt * 100) if prev_total_usdt > 0 else 0

        return jsonify({
            "totalUsdtValue": f"{total_usdt:.2f}",
            "totalBtcValue": f"{total_btc:.8f}",
            "assetCount": len([b for b in account["balances"]
                                if float(b["free"]) + float(b["locked"]) > 0]),
            "change24h": f"{change_24h:.2f}",
            "change24hPercent": f"{change_24h_pct:.2f}",
            "topAsset": top_asset,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/open-orders")
def open_orders():
    try:
        orders = binance_get("/api/v3/openOrders", signed=True)
        mapped = [{
            "orderId": o["orderId"],
            "orderListId": o.get("orderListId", -1),
            "symbol": o["symbol"],
            "side": o["side"],
            "type": o["type"],
            "price": o["price"],
            "origQty": o["origQty"],
            "executedQty": o["executedQty"],
            "status": o["status"],
            "time": o["time"],
            "stopPrice": o.get("stopPrice", "0") or "0",
            "takeProfitPrice": None,
        } for o in orders]
        return jsonify(mapped)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/recent-trades")
def recent_trades():
    try:
        account = binance_get("/api/v3/account", signed=True)
        non_zero = [
            b for b in account["balances"]
            if float(b["free"]) + float(b["locked"]) > 0
            and b["asset"] not in ("USDT", "BUSD", "USDC")
        ]
        symbols = [f"{b['asset']}USDT" for b in non_zero[:5]]

        all_trades = []
        for sym in symbols:
            try:
                trades = binance_get("/api/v3/myTrades",
                                     {"symbol": sym, "limit": 10}, signed=True)
                all_trades.extend(trades)
            except Exception:
                pass

        all_trades.sort(key=lambda t: t["time"], reverse=True)
        recent = all_trades[:50]

        mapped = [{
            "id": t["id"],
            "symbol": t["symbol"],
            "orderId": t["orderId"],
            "side": "BUY" if t["isBuyer"] else "SELL",
            "price": t["price"],
            "qty": t["qty"],
            "quoteQty": t["quoteQty"],
            "commission": t["commission"],
            "commissionAsset": t["commissionAsset"],
            "time": t["time"],
            "isBuyer": t["isBuyer"],
            "isMaker": t["isMaker"],
        } for t in recent]
        return jsonify(mapped)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/ticker")
def ticker():
    try:
        account = binance_get("/api/v3/account", signed=True)
        all_prices = binance_get("/api/v3/ticker/price")
        price_map = {p["symbol"]: p["price"] for p in all_prices}

        non_zero = [
            b for b in account["balances"]
            if float(b["free"]) + float(b["locked"]) > 0
            and b["asset"] not in ("USDT", "BUSD", "USDC")
        ]

        with_value = []
        for b in non_zero:
            total = float(b["free"]) + float(b["locked"])
            usdt_pair = price_map.get(f"{b['asset']}USDT")
            val = total * float(usdt_pair) if usdt_pair else 0
            with_value.append((b, val))
        with_value.sort(key=lambda x: x[1], reverse=True)

        symbols = [
            f"{b['asset']}USDT"
            for b, _ in with_value
            if price_map.get(f"{b['asset']}USDT")
        ][:12]

        if not symbols:
            return jsonify([])

        tickers = []
        for sym in symbols:
            try:
                t = binance_get("/api/v3/ticker/24hr", {"symbol": sym})
                tickers.append(t)
            except Exception:
                pass

        return jsonify(tickers)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/prices")
def prices():
    try:
        all_prices = binance_get("/api/v3/ticker/price")
        price_map = {p["symbol"]: p["price"] for p in all_prices}

        major_pairs = [
            "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
            "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "MATICUSDT", "DOTUSDT",
            "LTCUSDT", "LINKUSDT", "UNIUSDT", "ATOMUSDT", "XLMUSDT",
        ]
        result = [{"symbol": s, "price": price_map[s]}
                  for s in major_pairs if s in price_map]
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/market-overview")
def market_overview():
    try:
        tickers = binance_get("/api/v3/ticker/24hr")

        usdt_tickers = [
            t for t in tickers
            if t["symbol"].endswith("USDT")
            and "UP" not in t["symbol"]
            and "DOWN" not in t["symbol"]
            and "BEAR" not in t["symbol"]
            and "BULL" not in t["symbol"]
            and float(t["quoteVolume"]) > 1_000_000
        ]
        usdt_tickers.sort(key=lambda t: float(t["priceChangePercent"]), reverse=True)

        top_gainers = [
            {"symbol": t["symbol"], "priceChangePercent": t["priceChangePercent"],
             "lastPrice": t["lastPrice"]}
            for t in usdt_tickers[:5]
        ]
        top_losers = [
            {"symbol": t["symbol"], "priceChangePercent": t["priceChangePercent"],
             "lastPrice": t["lastPrice"]}
            for t in reversed(usdt_tickers[-5:])
        ]

        btc = next((t for t in tickers if t["symbol"] == "BTCUSDT"), None)
        eth = next((t for t in tickers if t["symbol"] == "ETHUSDT"), None)

        return jsonify({
            "topGainers": top_gainers,
            "topLosers": top_losers,
            "btcPrice": btc["lastPrice"] if btc else "0",
            "ethPrice": eth["lastPrice"] if eth else "0",
            "btcChange24h": btc["priceChangePercent"] if btc else "0",
            "ethChange24h": eth["priceChangePercent"] if eth else "0",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/binance/klines")
def klines():
    symbol = request.args.get("symbol")
    if not symbol:
        return jsonify({"error": "symbol query param is required"}), 400

    limit = min(int(request.args.get("limit", 300)), 500)
    try:
        raw = binance_get("/api/v3/klines",
                          {"symbol": symbol, "interval": "1m", "limit": limit})
        result = [{
            "openTime": k[0],
            "open": k[1],
            "high": k[2],
            "low": k[3],
            "close": k[4],
            "volume": k[5],
            "closeTime": k[6],
        } for k in raw]
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Serve React SPA (must be last)
# ---------------------------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
    file_path = os.path.join(static_dir, path)
    if path and os.path.isfile(file_path):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
