const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const fs = require("fs");
const indexjs = require("../app.js");
const fetch = require("node-fetch");
const Queue = require("../handlers/Queue.js");
const log = require("../handlers/log.js");

/* Ensure platform release target is met */
const garfanaModule = {
  name: "Extra Features",
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

  /* Generate / fetch panel password */
  app.get("/api/password", async (req, res) => {
    if (!req.session.userinfo?.id) return res.redirect("/login");

    const existing = await db.get("password-" + req.session.userinfo.id);
    if (existing) return res.json({ password: existing });

    const newpassword = makeid(
      settings.api.client.passwordgenerator.length
    );

    await fetch(
      settings.pterodactyl.domain +
        "/api/application/users/" +
        req.session.pterodactyl.id,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
        },
        body: JSON.stringify({
          username: req.session.pterodactyl.username,
          email: req.session.pterodactyl.email,
          first_name: req.session.pterodactyl.first_name,
          last_name: req.session.pterodactyl.last_name,
          password: newpassword,
        }),
      }
    );

    await db.set("password-" + req.session.userinfo.id, newpassword);
    return res.json({ password: newpassword });
  });

  /* Redirect to panel */
  app.get("/panel", async (req, res) => {
    res.redirect(settings.pterodactyl.domain);
  });

  /* User notifications */
  app.get("/notifications", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const notifications =
      (await db.get("notifications-" + req.session.userinfo.id)) || [];

    res.json(notifications);
  });

  /* Regenerate password */
  app.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    if (settings.api.client.allow.regen !== true) {
      return res.send("Password regeneration is currently disabled.");
    }

    const newpassword = makeid(
      settings.api.client.passwordgenerator.length
    );

    await fetch(
      settings.pterodactyl.domain +
        "/api/application/users/" +
        req.session.pterodactyl.id,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
        },
        body: JSON.stringify({
          username: req.session.pterodactyl.username,
          email: req.session.pterodactyl.email,
          first_name: req.session.pterodactyl.first_name,
          last_name: req.session.pterodactyl.last_name,
          password: newpassword,
        }),
      }
    );

    await db.set("password-" + req.session.userinfo.id, newpassword);
    res.redirect("/account");
  });
};

/* Password generator */
function makeid(length) {
  let result = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
