const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");

/* Ensure platform release target is met */
const garfanaModule = {
  name: "LV",
  api_level: 3,
  target_platform: "0.8.0",
};

if (garfanaModule.target_platform !== settings.version) {
  console.log(
    `Module ${garfanaModule.name} does not support this Garfana release. ` +
    `Built for ${garfanaModule.target_platform}, running on ${settings.version}.`
  );
  process.exit(1);
}

/* Module */
module.exports.garfanaModule = garfanaModule;
module.exports.load = async function (app, db) {
  const lvcodes = {};
  const cooldowns = {};
  const dailyLimits = {};

  /* Generate LV link */
  app.get("/lv/gen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const requiredCookies = ["x5385", "x4634", "g9745", "h2843"];
    const hasCookie = requiredCookies.some(
      (cookie) => req.cookies[cookie] !== undefined
    );

    if (!hasCookie) {
      return res.status(403).send("Access denied.");
    }

    requiredCookies.forEach((cookie) => {
      if (req.cookies[cookie]) res.clearCookie(cookie);
    });

    const userId = req.session.userinfo.id;
    const now = Date.now();

    /* Daily limit (50) */
    if (
      !dailyLimits[userId] ||
      dailyLimits[userId].date !== new Date().toDateString()
    ) {
      dailyLimits[userId] = {
        count: 0,
        date: new Date().toDateString(),
      };
    }

    if (dailyLimits[userId].count >= 50) {
      return res
        .status(429)
        .send("Daily limit reached. Try again tomorrow.");
    }

    /* Cooldown (10s) */
    if (cooldowns[userId] && now < cooldowns[userId]) {
      const remaining = msToHoursAndMinutes(
        cooldowns[userId] - now
      );
      return res
        .status(429)
        .send(
          `Please wait ${remaining} before generating another LV link.`
        );
    }

    const code = makeid(12);
    const referer =
      req.headers.referer || req.headers.referrer || "";
    const lvurl = linkvertise(
      "1196418",
      referer + `redeem?code=${code}`
    );

    lvcodes[userId] = {
      code,
      user: userId,
      generated: now,
    };

    cooldowns[userId] = now + 10_000;
    dailyLimits[userId].count++;

    res.redirect(lvurl);
  });

  /* Redeem LV */
  app.get("/earnredeem", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/");

    const code = req.query.code;
    if (!code)
      return res.send("An error occurred with your browser!");

    if (
      !req.headers.referer ||
      !req.headers.referer.includes("linkvertise.com")
    ) {
      return res.redirect("/earn?err=BYPASSER");
    }

    const userId = req.session.userinfo.id;
    const usercode = lvcodes[userId];

    if (!usercode || usercode.code !== code)
      return res.redirect("/earn");

    delete lvcodes[userId];

    const coins = (await db.get(`coins-${userId}`)) || 0;
    await db.set(`coins-${userId}`, coins + 10);

    res.redirect("/earn?err=none");
  });

  /* API: LV limit info */
  app.get("/api/lv/limit", async (req, res) => {
    if (!req.session.pterodactyl)
      return res.status(401).json({ error: "Unauthorized" });

    const userId = req.session.userinfo.id;
    const limit =
      dailyLimits[userId] || {
        count: 0,
        date: new Date().toDateString(),
      };

    res.json({
      daily_limit: 50,
      used_today: limit.count,
      remaining: 50 - limit.count,
      reset_time: new Date(
        new Date().setHours(24, 0, 0, 0)
      ).toISOString(),
    });
  });
};

/* Helpers */

function linkvertise(userid, link) {
  const base = `https://link-to.net/${userid}/${Math.random() * 1000}/dynamic`;
  return base + "?r=" + btoa(encodeURI(link));
}

function btoa(str) {
  return Buffer.from(str.toString(), "binary").toString("base64");
}

function makeid(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function msToHoursAndMinutes(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round(((ms % 3_600_000) / 60_000) * 100) / 100;
  return `${h} hour${h === 1 ? "" : "s"} and ${m} minute${
    m === 1 ? "" : "s"
  }`;
}