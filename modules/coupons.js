const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const indexjs = require("../app.js");
const log = require("../handlers/log.js");

/* Ensure platform release target is met */
const garfanaModule = {
  name: "Coupon System",
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

  /* Coupon redemption page */
  app.get("/redeem", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const theme = indexjs.get(req);
    res.render("redeem", await indexjs.renderdataeval(req, theme));
  });

  /* Handle coupon redemption */
  app.post("/redeem", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let code = req.body.code;

    /* Validate code */
    if (!code) return res.redirect("/redeem?err=INVALIDCODE");

    code = code.trim().toLowerCase();
    if (!/^[a-z0-9]+$/.test(code)) {
      return res.redirect("/redeem?err=INVALIDCODE");
    }

    /* Check coupon */
    const coupon = await db.get("coupon-" + code);
    if (!coupon) return res.redirect("/redeem?err=INVALIDCODE");

    /* Check usage */
    const userId = req.session.userinfo.id;
    const usedCoupons =
      (await db.get("used-coupons-" + userId)) || [];

    if (usedCoupons.includes(code)) {
      return res.redirect("/redeem?err=ALREADYUSED");
    }

    /* Load balances */
    const currentCoins = (await db.get("coins-" + userId)) || 0;
    const currentExtra =
      (await db.get("extra-" + userId)) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0,
      };

    /* Apply coupon values */
    const coins = Number(coupon.coins) || 0;
    const ram = Number(coupon.ram) || 0;
    const disk = Number(coupon.disk) || 0;
    const cpu = Number(coupon.cpu) || 0;
    const servers = Number(coupon.servers) || 0;

    if (coins > 0) {
      await db.set("coins-" + userId, currentCoins + coins);
    }

    if (ram || disk || cpu || servers) {
      currentExtra.ram += ram;
      currentExtra.disk += disk;
      currentExtra.cpu += cpu;
      currentExtra.servers += servers;
      await db.set("extra-" + userId, currentExtra);
    }

    /* Mark coupon as used */
    usedCoupons.push(code);
    await db.set("used-coupons-" + userId, usedCoupons);

    /* Log redemption */
    log(
      "Redeem Coupon",
      `${req.session.userinfo.username} redeemed coupon \`${code}\`
coins: ${coins}
ram: ${ram} MB
disk: ${disk} MB
cpu: ${cpu}%
servers: ${servers}`
    );

    res.redirect("/redeem?success=REDEEMED");
  });
};
