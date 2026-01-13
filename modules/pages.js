const indexjs = require("../app.js");
const ejs = require("ejs");
const express = require("express");
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const fetch = require("node-fetch");
const arciotext = require("../handlers/afk.js");

/* Ensure platform release target is met */
const garfanaModule = { 
  name: "Pages",
  api_level: 3,
  target_platform: "0.8.0"
};

if (garfanaModule.target_platform !== settings.version) {
  console.error(
    `Module ${garfanaModule.name} does not support this platform release of Garfana. ` +
    `Expected ${garfanaModule.target_platform}, got ${settings.version}.`
  );
  process.exit(1);
}

/* Module */
module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {

  /* =========================
     MAIN PAGE HANDLER
     ========================= */

  app.all("*", async (req, res, next) => {
    try {
      // Validate Pterodactyl session
      if (
        req.session.pterodactyl &&
        req.session.userinfo &&
        req.session.pterodactyl.id !==
          (await db.get("users-" + req.session.userinfo.id))
      ) {
        return res.redirect("/login?prompt=none");
      }

      const theme = indexjs.get(req);

      // Must be logged in
      if (
        theme.settings.mustbeloggedin.includes(req.path) &&
        (!req.session.userinfo || !req.session.pterodactyl)
      ) {
        return res.redirect("/login");
      }

      // Admin pages
      if (theme.settings.mustbeadmin.includes(req.path)) {
        const renderData = await indexjs.renderdataeval(req, theme);
        return res.render(theme.settings.index, renderData);
      }

      // Normal pages
      const renderData = await indexjs.renderdataeval(req, theme);
      return res.render(theme.settings.index, renderData);

    } catch (err) {
      return next(err);
    }
  });

  /* =========================
     STATIC ASSETS
     ========================= */

  app.use("/assets", express.static("./assets"));
  app.use("/preline", express.static("./node_modules/preline"));

  /* =========================
     404 HANDLER
     ========================= */

  app.use((req, res) => {
    try {
      res.status(404).render("404");
    } catch {
      res.status(404).send("404 Not Found");
    }
  });

  /* =========================
     GLOBAL ERROR HANDLER
     ========================= */

  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);

    if (res.headersSent) return next(err);

    try {
      res.status(500).render("500", { err });
    } catch {
      res.status(500).send("Internal Server Error");
    }
  });
};
