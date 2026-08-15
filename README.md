# Nebulactyl
![Banner](https://raw.githubusercontent.com/nebulactyl/Nebulactyl/refs/heads/main/assets/profileBanner.png)

[![Discord](https://img.shields.io/discord/1538101935016644719?label=Discord&logo=discord)](https://discord.gg/W8a5dQGTvx)
![ShellCheck](https://img.shields.io/badge/ShellCheck-passing-brightgreen?logo=github)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Made with Node.js](https://img.shields.io/badge/Made%20with-Node.js-339933?logo=node.js&logoColor=white)


> A nebula-themed, monetized client area for the [**Pterodactyl Panel**](https://pterodactyl.io).
> Made by [**Nebulactyl Development**](https://nebulactyl.qd.je).

**Nebulactyl** lets your users create, edit and delete servers, and earn coins (via AFK, an ad banner, and Linkvertise/Linkpays/watch-ad tasks) which can be spent upgrading their servers in the store.


## What's new in Nebulactyl

- **Nebula theme** — a dark, glassy space theme with an animated starfield background, drifting nebula gradients, glowing buttons, synthesized sound effects and small celebration animations (confetti on reward claims). No external audio files are used.
- **Earn Coins page** (`/earn`) — three configurable ways for users to earn coins:
  - **Linkvertise** task
  - **Linkpays** task
  - **Watch Ad** task (an in-app countdown, no redirect)
  - Each task has its own coin reward and a **daily completion limit per user** (default: 5/day), configurable from the admin Settings page.
- **Ad banner** — a single, static banner ad slot shown **only on the AFK page**. Paste your ad network's embed code (e.g. an AdSense unit) into Admin Settings → Monetization. Nebulactyl never shows popups, popunders or interstitial ads anywhere.
- **Admin Monetization panel** — configure the ad banner and all three earn tasks (enable/disable, reward amount, daily limit) directly from `/settings`, no file editing required.
- Minor performance work: gzip response compression, cached static assets, and a saner default worker-process count for clustering (auto-detected from CPU cores instead of a hardcoded 8).

## Get started

1. Clone the Github Repository
```bash
git clone https://github.com/nebulactyl/Nebulactyl.git
```
3. Enter the directory and configure `settings.json` — the Pterodactyl and OAuth2 settings **must** be configured; everything else (coins, earn tasks, ad banner, logging) is optional.
4. Run `npm install` to install dependencies.
5. Check everything over and make sure Nebulactyl is configured correctly.
6. Create SSL certificates for your target domain and set up an NGINX reverse proxy (see below).

### Configuring monetization

- **Ad banner**: Admin → Settings → Monetization → set *Ad banner* to Enabled and paste your ad network's embed code. It will only render on the AFK page.
- **Linkvertise**: enter your Linkvertise user ID, coin reward and daily limit. Nebulactyl uses Linkvertise's public dynamic-link format, so no API key is required.
- **Linkpays**: enter your Linkpays user ID/API key. If Linkpays' URL format differs from the default, you can override it with `api.client.earn.linkpays.urlTemplate` in `settings.json` (supports `{userId}` and `{callback}` placeholders).
- **Watch Ad**: an in-app task that reuses the same ad banner slot; set the coin reward, watch duration and daily limit.

All coin rewards are credited to the same coin balance used everywhere else in the dashboard (store, AFK page, transfers), so no extra setup is needed to make earned coins usable.

## NGINX Reverse Proxy

Here's a proxy config that we recommend, however you are free to change it:

```nginx
server {
    listen 80;
    server_name <domain>;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;

    location /ws {
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_pass "http://localhost:<port>/ws";
    }

    server_name <domain>;

    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols SSLv3 TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers  HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
      proxy_pass http://localhost:<port>/;
      proxy_buffering off;
      proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development Tools

These commands are available:
```
npm run start - starts Nebulactyl via nodemon
npm run build - builds TailwindCSS, required for making changes to utility classes used in the .ejs views
```

> The Nebula theme itself (`assets/nebula.css`, `assets/nebula.js`) is plain CSS/JS and does not need a build step — only edits to Tailwind utility classes inside `.ejs` files require `npm run build`.

## Nebulactyl API v2

### /api/v2/userinfo

```
Method: GET
Query Parameters:
  - id (string): The user's ID

Response:
  - status (string): "success" or an error message
  - package (object): The user's package details
  - extra (object): The user's additional resources
  - userinfo (object): The user's information from the Pterodactyl panel
  - coins (number | null): The user's coin balance (if coins is enabled)
```

### /api/v2/setcoins

```
Method: POST
Request Body:
  - id (string): The user's ID
  - coins (number): The number of coins to set

Response:
  - status (string): "success" or an error message
```

### /api/v2/setplan

```
Method: POST
Request Body:
  - id (string): The user's ID
  - package (string, optional): The package name (if not provided, the user's package will be removed)

Response:
  - status (string): "success" or an error message
```

### /api/v2/setresources

```
Method: POST
Request Body:
  - id (string): The user's ID
  - ram (number): The amount of RAM to set
  - disk (number): The amount of disk space to set
  - cpu (number): The amount of CPU to set
  - servers (number): The number of servers to set

Response:
  - status (string): "success" or an error message
```

## Troubleshooting

**`Error: Could not locate the bindings file` / `sqlite3` on startup** — `@keyv/sqlite` depends on the native `sqlite3` package, which needs to compile a binary on install via `node-gyp`. Newer npm versions (12+) block native install scripts by default for security. This project's `package.json` already whitelists it via `allowScripts`, so a fresh `npm install` should work — but if you're hitting this on an existing install, run:
```
npm install-scripts approve sqlite3
npm install
```
then restart. If the compile still fails after that, your container image is likely missing `python3`, `make` and `g++` (node-gyp's build prerequisites) — install those, or switch `settings.database` to a Keyv backend that doesn't need native compilation.

## Credits

Nebulactyl is made by **Void Development** ([@cvr8728](https://zenpaizombie.qzz.io)).

Nebulactyl is a derivative work built on top of the original Heliactyl project. Appropriate credit is retained in [LICENSE](./LICENSE) as required by its license.
