# Binance Dashboard — Render Deployment Guide

## STEP 1 — Push code to GitHub

1. Extract this folder anywhere on your computer
2. Open a terminal inside the extracted `render-deploy/` folder
3. Run:

```bash
git init
git add .
git commit -m "Initial commit"
```

4. Go to **github.com → New repository** → name it `binance-dashboard` → Create
5. Copy the remote URL they show you, then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/binance-dashboard.git
git branch -M main
git push -u origin main
```

---

## STEP 2 — Create a Web Service on Render

1. Go to **https://render.com** → Sign in
2. Click **New → Web Service**
3. Connect your GitHub account and select the `binance-dashboard` repo
4. Fill in the settings:

| Field            | Value                        |
|-----------------|------------------------------|
| Name            | `binance-dashboard`          |
| Region          | Singapore (or your region)   |
| Branch          | `main`                       |
| Runtime         | **Node**                     |
| Build Command   | `npm install && npm run build` |
| Start Command   | `npm start`                  |
| Plan            | Free (or Starter)            |

---

## STEP 3 — Add Environment Variables in Render

In your Render service → **Environment** tab, add:

| Key                  | Value                         |
|---------------------|-------------------------------|
| `NODE_ENV`          | `production`                  |
| `BINANCE_API_KEY`   | Your Binance API key          |
| `BINANCE_API_SECRET`| Your Binance API secret       |
| `BOT_KEY`           | `btc`                        |

> **Binance API key setup:**
> 1. Go to Binance → Account → API Management
> 2. Create new API key → Label it "dashboard"
> 3. Enable **Read Info** only (no trading/withdrawal)
> 4. If you have a static IP, whitelist it (optional but recommended)

---

## STEP 4 — Deploy

Click **Create Web Service** → Render will:
1. Clone your repo
2. Run `npm install && npm run build` (builds React SPA + bundles server)
3. Start `npm start` (Express serves everything on Render's PORT)

Your dashboard will be live at: `https://binance-dashboard-XXXX.onrender.com`

> **Note:** Free tier services spin down after 15 minutes of inactivity.
> First load after sleep takes ~30 seconds to wake up.

---

## STEP 5 — Run BTCCRASHBOT.py

Install dependencies on your computer:

```bash
pip install websocket-client requests
```

Configure and run:

```bash
# Option A: Use env vars (recommended)
DASHBOARD_URL=https://binance-dashboard-XXXX.onrender.com BOT_KEY=btc python BTCCRASHBOT.py

# Option B: Edit the CONFIG section in BTCCRASHBOT.py directly
python BTCCRASHBOT.py
```

You should see output like:
```
✅ [SAFE] $68,432.00 | drops: 1m=0.00% 5m=0.01% ... | spd=+0.02% vol=0.01% | HTTP 200
```

The BTC Crash Monitor card on your dashboard updates every 3 seconds.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard loads but shows `…` everywhere | Check Binance API keys in Render environment |
| API returns 502 | Binance rate-limit or wrong API keys |
| Bot shows HTTP 403 | `BOT_KEY` in env must match `BOT_KEY` in Python bot |
| Bot data card says "offline" | Start `BTCCRASHBOT.py` on your machine |
| Service won't start | Check Render logs — usually a missing env var |
