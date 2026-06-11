# Binance Dashboard - Render Deployment Guide

This guide walks you through deploying this TanStack Start dashboard on [Render](https://render.com).

## Prerequisites

- A [Render](https://render.com) account
- A [GitHub](https://github.com) account
- (Optional) Your own Supabase project if you want to migrate away from Lovable Cloud

## Step 1: Update `vite.config.ts` for Node.js

Before deploying, update `vite.config.ts` to use Nitro's `node-server` preset for Render:

```typescript
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
});
```

> **Note:** The `node-server` preset tells Nitro to output a Node.js-compatible server instead of the default Cloudflare Worker target.

## Step 2: Add Production Start Script

Add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "preview": "vite preview"
  }
}
```

## Step 3: Create Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

The following variables are **required**:

| Variable | Description | How to Get |
|----------|-------------|------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Project Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | Supabase Dashboard → Project Settings → API |
| `SUPABASE_PROJECT_ID` | Your Supabase project ID | From the URL: `https://<project-id>.supabase.co` |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` (client-side) | Same as above |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same as `SUPABASE_PUBLISHABLE_KEY` (client-side) | Same as above |
| `VITE_SUPABASE_PROJECT_ID` | Same as `SUPABASE_PROJECT_ID` (client-side) | Same as above |
| `BINANCE_API_KEY` | Your Binance API key | [Binance API Management](https://www.binance.com/en/my/settings/api-management) |
| `BINANCE_API_SECRET` | Your Binance API secret | Same as above |

> **Important:** The Binance API has IP restrictions. If you're deploying on Render, you may need to whitelist Render's outbound IPs or use a proxy. See the Troubleshooting section below.

## Step 4: Push to GitHub

1. Create a new repository on GitHub
2. Push this code:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## Step 5: Deploy on Render

### Option A: Using Blueprint (`render.yaml`)

If you pushed the `render.yaml` file included in this repo:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Blueprint**
3. Connect your GitHub repository
4. Render will automatically create the web service

### Option B: Manual Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `binance-dashboard` (or your preference)
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start` (or `node .output/server/index.mjs`)
   - **Plan:** Free (or paid for better performance)
5. Add Environment Variables:
   - Copy all variables from your `.env` file into Render's Environment section
   - Do NOT include quotes around values in the Render dashboard
6. Click **Create Web Service**

## Step 6: Configure Supabase (if needed)

If you're using your own Supabase project (not Lovable Cloud):

1. Update the URL and keys in your Render environment variables
2. Ensure your Supabase project has the same database schema
3. Update Row Level Security (RLS) policies as needed

## Troubleshooting

### Binance API 401 / 451 Errors

Binance restricts API access by IP and region. If you see:
- **401 "Invalid API-key, IP, or permissions"** → Check your API key permissions and IP whitelist
- **451 "Service unavailable from a restricted location"** → Your Render server is in a blocked region

**Solutions:**
1. Use a proxy/VPN endpoint in an allowed region
2. Consider using a different data source (e.g., CoinGecko public API for read-only data)
3. Use Binance's testnet for development

### Build Errors

If the build fails on Render:
1. Check that `vite.config.ts` has the `node-server` preset
2. Ensure all environment variables are set
3. Check Render logs for specific error messages

### Database Connection Issues

If Supabase queries fail:
1. Verify `SUPABASE_URL` is correct (no trailing slash)
2. Check that `SUPABASE_PUBLISHABLE_KEY` is the **anon** key (not the service role key)
3. Verify RLS policies allow the operations you're performing

## Project Structure

```
├── src/
│   ├── components/       # React components
│   ├── lib/             # Utility functions & server functions
│   ├── routes/          # TanStack Start routes
│   ├── integrations/    # Supabase integration
│   ├── server.ts        # SSR server entry
│   ├── start.ts         # TanStack Start config
│   └── router.tsx       # Router setup
├── supabase/            # Supabase migrations & config
├── vite.config.ts       # Vite + TanStack Start config
├── package.json         # Dependencies & scripts
└── render.yaml          # Render Blueprint (optional)
```

## Support

- [TanStack Start Docs](https://tanstack.com/start/latest)
- [Render Docs](https://docs.render.com)
- [Supabase Docs](https://supabase.com/docs)
