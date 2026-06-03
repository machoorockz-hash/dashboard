# Binance Dashboard — Render Deployment

A Python Flask backend serving the Binance spot trading dashboard.

## Project structure

```
.
├── server.py           # Flask API server (all Binance endpoints)
├── requirements.txt    # Python dependencies
├── render.yaml         # Render deployment config
├── .env.example        # Environment variable template
└── static/             # Pre-built React frontend (served by Flask)
    ├── index.html
    └── assets/
```

## Deploy to Render

### Option A — One-click via render.yaml

1. Push this folder to a GitHub/GitLab repo
2. Go to https://render.com → New → Blueprint
3. Connect your repo — Render will read `render.yaml` automatically
4. Set `BINANCE_API_KEY` and `BINANCE_SECRET_KEY` in the Render dashboard under Environment
5. Click Deploy

### Option B — Manual web service

1. Go to https://render.com → New → Web Service
2. Connect your repo
3. Set:
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn server:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
4. Add environment variables:
   - `BINANCE_API_KEY` → your Binance API key
   - `BINANCE_SECRET_KEY` → your Binance secret key
5. Click Create Web Service

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env and fill in your keys

# Load env and start
export $(cat .env | xargs) && python server.py
```

The app will be at http://localhost:5000

## API Key permissions required

In your Binance account → API Management:
- ✅ Enable Reading (spot)
- ❌ Do NOT enable Spot Trading
- ❌ Do NOT enable Withdrawals
- ❌ Do NOT enable Futures

## Notes

- API keys can also be entered in the browser via the Settings page — they are
  saved in localStorage and sent as request headers on every API call.
- The Flask server accepts `x-binance-api-key` and `x-binance-secret-key`
  headers and uses them instead of environment variables when present.
