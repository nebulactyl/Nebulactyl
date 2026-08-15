/**
 * |-| [- |_ | /\ ( ~|~ `/ |_
 *
 * Nebulactyl — Nebula Core
 *
 * Coin-earning tasks: Linkvertise, Linkpays and an in-app "watch ad" task.
 * Each provider has its own configurable coin reward and daily completion
 * limit (settings.api.client.earn). No popups are ever opened server-side —
 * this file only issues single-use, time-gated tokens and credits coins
 * once a task has genuinely been completed.
 * @module earn
 */

const settings = require("../settings.json");
const fs = require("fs");
const crypto = require("crypto");
const log = require("../misc/log");

const PENDING_TTL_MS = 30 * 60 * 1000; // pending task tokens expire after 30 minutes

// The generic /settings/update endpoint always writes values as strings
// (it has no concept of types), so treat "true"/"false" strings the same
// as real booleans, and coerce numeric fields defensively.
function isOn(v) {
  return v === true || v === "true";
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function freshSettings() {
  return JSON.parse(fs.readFileSync("./settings.json").toString());
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function providerConfig(newsettings, provider) {
  const earn = newsettings.api.client.earn;
  if (!earn || !isOn(earn.enabled)) return null;
  let cfg = null;
  if (provider === "linkvertise") cfg = earn.linkvertise;
  else if (provider === "linkpays") cfg = earn.linkpays;
  else if (provider === "adswatch") cfg = earn.adsWatch;
  if (!cfg) return null;
  return {
    enabled: isOn(cfg.enabled),
    userId: cfg.userId,
    urlTemplate: cfg.urlTemplate,
    coins: num(cfg.coins, 0),
    dailyLimit: num(cfg.dailyLimit, 5),
    minSeconds: num(cfg.minSeconds, 8),
    watchSeconds: num(cfg.watchSeconds, 20)
  };
}

module.exports.load = async function (app, db) {
  /**
   * Starts a task: generates a single-use pending token, checks the daily
   * limit for that provider, then either redirects out to the shortlink
   * provider (Linkvertise / Linkpays) or straight back to /earn with the
   * token attached (ad-watch, which happens entirely in-app).
   */
  app.get("/earn/start", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const newsettings = freshSettings();
    const provider = (req.query.provider || "").toLowerCase();
    const cfg = providerConfig(newsettings, provider);

    if (!cfg || cfg.enabled !== true) return res.redirect("/earn?err=DISABLED");

    const userId = req.session.userinfo.id;
    const limit = cfg.dailyLimit || 5;
    const countKey = `earncount-${userId}-${provider}-${todayKey()}`;
    const used = (await db.get(countKey)) || 0;
    if (used >= limit) return res.redirect("/earn?err=LIMITREACHED");

    const token = crypto.randomBytes(16).toString("hex");
    await db.set(
      `earnpending-${token}`,
      { userId, provider, issuedAt: Date.now() },
      PENDING_TTL_MS
    );

    if (provider === "adswatch") {
      return res.redirect(`/earn?adtoken=${token}`);
    }

    const callbackUrl = `${req.protocol}://${req.get("host")}/earn/callback?token=${token}`;

    if (provider === "linkvertise") {
      const encoded = Buffer.from(callbackUrl).toString("base64");
      const suffix = Math.floor(Math.random() * 1000);
      const url = `https://link-to.net/${cfg.userId}/${suffix}/dynamic?r=${encoded}`;
      return res.redirect(url);
    }

    if (provider === "linkpays") {
      const template =
        cfg.urlTemplate || "https://linkpays.co/st?api={userId}&url={callback}";
      const url = template
        .replace("{userId}", encodeURIComponent(cfg.userId))
        .replace("{callback}", encodeURIComponent(callbackUrl));
      return res.redirect(url);
    }

    return res.redirect("/earn?err=DISABLED");
  });

  /**
   * Callback the shortlink provider redirects the user back to once they've
   * completed the ad flow. Verifies the token belongs to this user, hasn't
   * been used before, and that a plausible minimum amount of time has
   * elapsed (the standard heuristic used since there's no server-to-server
   * postback), then credits the coins.
   */
  app.get("/earn/callback", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const token = req.query.token;
    if (!token) return res.redirect("/earn?err=TASKFAILED");

    const pending = await db.get(`earnpending-${token}`);
    if (!pending) return res.redirect("/earn?err=TASKFAILED");
    if (pending.userId !== req.session.userinfo.id)
      return res.redirect("/earn?err=TASKFAILED");

    const newsettings = freshSettings();
    const cfg = providerConfig(newsettings, pending.provider);
    if (!cfg || cfg.enabled !== true) {
      await db.delete(`earnpending-${token}`);
      return res.redirect("/earn?err=DISABLED");
    }

    const elapsedSeconds = (Date.now() - pending.issuedAt) / 1000;
    if (elapsedSeconds < (cfg.minSeconds || 8)) {
      return res.redirect("/earn?err=TOOFAST");
    }

    const userId = req.session.userinfo.id;
    const countKey = `earncount-${userId}-${pending.provider}-${todayKey()}`;
    const used = (await db.get(countKey)) || 0;
    const limit = cfg.dailyLimit || 5;
    if (used >= limit) {
      await db.delete(`earnpending-${token}`);
      return res.redirect("/earn?err=LIMITREACHED");
    }

    await db.delete(`earnpending-${token}`);
    await db.set(countKey, used + 1);

    const currentCoins = (await db.get(`coins-${userId}`)) || 0;
    await db.set(`coins-${userId}`, currentCoins + cfg.coins);

    log(
      "earned coins",
      `${req.session.userinfo.username}#${req.session.userinfo.discriminator} earned \`${cfg.coins}\` coins by completing a ${pending.provider} task.`
    );

    return res.redirect(`/earn?claimed=${cfg.coins}`);
  });

  /**
   * Claims the reward for the in-app "watch ad" task once the required
   * watch time has passed.
   */
  app.get("/earn/watchad/claim", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const token = req.query.token;
    if (!token) return res.redirect("/earn?err=TASKFAILED");

    const pending = await db.get(`earnpending-${token}`);
    if (!pending || pending.provider !== "adswatch")
      return res.redirect("/earn?err=TASKFAILED");
    if (pending.userId !== req.session.userinfo.id)
      return res.redirect("/earn?err=TASKFAILED");

    const newsettings = freshSettings();
    const cfg = providerConfig(newsettings, "adswatch");
    if (!cfg || cfg.enabled !== true) {
      await db.delete(`earnpending-${token}`);
      return res.redirect("/earn?err=DISABLED");
    }

    const elapsedSeconds = (Date.now() - pending.issuedAt) / 1000;
    if (elapsedSeconds < (cfg.watchSeconds || 20)) {
      return res.redirect("/earn?err=TOOFAST");
    }

    const userId = req.session.userinfo.id;
    const countKey = `earncount-${userId}-adswatch-${todayKey()}`;
    const used = (await db.get(countKey)) || 0;
    const limit = cfg.dailyLimit || 5;
    if (used >= limit) {
      await db.delete(`earnpending-${token}`);
      return res.redirect("/earn?err=LIMITREACHED");
    }

    await db.delete(`earnpending-${token}`);
    await db.set(countKey, used + 1);

    const currentCoins = (await db.get(`coins-${userId}`)) || 0;
    await db.set(`coins-${userId}`, currentCoins + cfg.coins);

    log(
      "earned coins",
      `${req.session.userinfo.username}#${req.session.userinfo.discriminator} earned \`${cfg.coins}\` coins by watching an ad.`
    );

    return res.redirect(`/earn?claimed=${cfg.coins}`);
  });

  /**
   * JSON status endpoint used by the Earn Coins page to render live
   * balances, per-provider daily usage and remaining task counts.
   */
  app.get("/earn/status", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "unauthorized" });

    const newsettings = freshSettings();
    const earn = newsettings.api.client.earn || { enabled: false };
    const userId = req.session.userinfo.id;
    const balance = (await db.get(`coins-${userId}`)) || 0;

    async function usageFor(provider) {
      const key = `earncount-${userId}-${provider}-${todayKey()}`;
      return (await db.get(key)) || 0;
    }

    const providers = ["linkvertise", "linkpays", "adswatch"];
    const tasks = {};
    for (const provider of providers) {
      const cfg = providerConfig(newsettings, provider);
      tasks[provider] = {
        enabled: !!(cfg && cfg.enabled),
        coins: cfg ? cfg.coins : 0,
        dailyLimit: cfg ? cfg.dailyLimit : 0,
        used: await usageFor(provider),
        watchSeconds: provider === "adswatch" ? cfg && cfg.watchSeconds : undefined,
        minSeconds: provider !== "adswatch" ? cfg && cfg.minSeconds : undefined
      };
    }

    res.json({
      enabled: isOn(earn.enabled),
      balance,
      tasks
    });
  });
};
