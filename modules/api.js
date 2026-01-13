const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const indexjs = require("../app.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const ejs = require("ejs");
const fetch = require("node-fetch");
const NodeCache = require("node-cache");
const Queue = require("../handlers/Queue.js");
const log = require("../handlers/log");
const arciotext = require("../handlers/afk");

const myCache = new NodeCache({ deleteOnExpire: true, stdTTL: 59 });

/* Ensure platform release target is met */
const garfanaModule = {
  name: "Garfana API 0.8.0",
  api_level: 3,
  target_platform: "0.8.0",
};

if (garfanaModule.target_platform !== settings.version) {
  console.log(
    "Module " +
      garfanaModule.name +
      " does not support this platform release of Garfana. " +
      "The module was built for platform " +
      garfanaModule.target_platform +
      " but is attempting to run on version " +
      settings.version +
      "."
  );
  process.exit(1);
}

/* Module */
module.exports.garfanaModule = garfanaModule;
module.exports.load = async function (app, db) {

  /* PANEL STATS */
  app.get("/stats", async (req, res) => {
    try {
      const fetchStats = async (endpoint) => {
        const response = await fetch(
          `${settings.pterodactyl.domain}/api/application/${endpoint}?per_page=100000`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.meta.pagination.total;
      };

      const [users, servers, nodes] = await Promise.all([
        fetchStats("users"),
        fetchStats("servers"),
        fetchStats("nodes"),
      ]);

      res.json({ users, servers, nodes });
    } catch (err) {
      console.error("Stats error:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  /* DAILY COINS STATUS */
  app.get("/api/dailystatus", async (req, res) => {
    if (!req.session.userinfo?.id) return res.redirect("/login");

    const lastClaim = new Date(
      await db.get("dailycoins1-" + req.session.userinfo.id)
    );
    const today = new Date();

    if (lastClaim && lastClaim.toDateString() === today.toDateString()) {
      return res.json({ text: "0" });
    }

    return res.json({ text: "1" });
  });

  /* CLAIM DAILY COINS */
  app.get("/daily-coins", async (req, res) => {
    if (!req.session.userinfo?.id) return res.redirect("/login");

    const today = new Date();
    const lastClaim = new Date(
      await db.get("dailycoins1-" + req.session.userinfo.id)
    );

    if (lastClaim && lastClaim.toDateString() === today.toDateString()) {
      return res.redirect("../dashboard?err=CLAIMED");
    }

    const coins = (await db.get("coins-" + req.session.userinfo.id)) || 0;
    await db.set("coins-" + req.session.userinfo.id, coins + 150);
    await db.set("dailycoins1-" + req.session.userinfo.id, today);

    res.redirect("../dashboard?err=none");
  });

  /* GIFT COINS */
  app.get("/giftcoins", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/");

    const senderId = req.session.userinfo.id;
    const recipientId = req.query.id;
    const coins = parseInt(req.query.coins);

    if (!recipientId || !coins)
      return res.redirect("/transfer?err=MISSINGFIELDS");
    if (recipientId === senderId)
      return res.redirect("/transfer?err=CANNOTGIFTYOURSELF");
    if (coins < 1) return res.redirect("/transfer?err=TOOLOWCOINS");

    const senderCoins = await db.get("coins-" + senderId);
    const recipientCoins = await db.get("coins-" + recipientId);

    if (recipientCoins === null)
      return res.redirect("/transfer?err=USERDOESNTEXIST");
    if (senderCoins < coins)
      return res.redirect("/transfer?err=CANTAFFORD");

    await db.set("coins-" + senderId, senderCoins - coins);
    await db.set("coins-" + recipientId, recipientCoins + coins);

    log(
      "Gifted Coins",
      `${req.session.userinfo.username} sent ${coins} coins to user ${recipientId}`
    );

    res.redirect("/transfer?err=none");
  });

  /* API STATUS */
  app.get("/api", async (req, res) => {
    if (!(await check(req, res))) return;
    res.json({ status: true });
  });

  /* AUTH CHECK */
  async function check(req, res) {
    const cfg = loadConfig("./config.toml");
    if (cfg.api.client.api.enabled) {
      if (req.headers.authorization === "Bearer " + cfg.api.client.api.code) {
        return true;
      }
    }

    const theme = indexjs.get(req);
    const html = await indexjs.renderdataeval(req, theme);
    res.render(theme.settings.notfound, html);
    return false;
  }
};
