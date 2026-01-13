const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const indexjs = require("../app.js");
const ejs = require("ejs");
const chalk = require("chalk");
const fs = require("fs");

/* Ensure platform release target is met */
const garfanaModule = {
  name: "AFK Page",
  api_level: 3,
  target_platform: "0.8.0"
};

if (garfanaModule.target_platform !== settings.version) {
  console.log(
    "Module " + garfanaModule.name +
    " does not support this platform release of Garfana. " +
    "The module was built for platform " + garfanaModule.target_platform +
    " but is attempting to run on version " + settings.version + "."
  );
  process.exit(1);
}

/* Module */
module.exports.garfanaModule = garfanaModule;
module.exports.load = async function (app, db) {

  app.ws("/" + settings.api.afk.path, async (ws, req) => {

    let currentlyonpage = await db.get("afkSessions");

    if (!req.session.pterodactyl) return ws.close();
    if (currentlyonpage[req.session.userinfo.id]) return ws.close();

    currentlyonpage[req.session.userinfo.id] = true;
    await db.set("afkSessions", currentlyonpage);

    // Coin rate for AFK earning
    let coinRate = settings.api.afk.coins;

    let coinloop = setInterval(async function () {
      let usercoins = await db.get("coins-" + req.session.userinfo.id);
      usercoins = usercoins ? usercoins : 0;

      usercoins =
        usercoins + (coinRate * (settings.api.afk.every / 60));

      await db.set("coins-" + req.session.userinfo.id, usercoins);
    }, settings.api.afk.every * 1000);

    ws.onclose = async () => {
      clearInterval(coinloop);
      let newonpage = await db.get("afkSessions");
      delete newonpage[req.session.userinfo.id];
      await db.set("afkSessions", newonpage);
    };

  });

};
