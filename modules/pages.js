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
  console.log(
    `Module ${garfanaModule.name} does not support this platform release of Garfana. ` +
    `The module was built for platform ${garfanaModule.target_platform} but is running on version ${settings.version}.`
  );
  process.exit();
}

/* Module */
module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {
  app.all("/", async (req, res) => {
    try {
      // Check Pterodactyl session validity
      if (
        req.session.pterodactyl &&
        req.session.pterodactyl.id !==
          (await db.get("users-" + req.session.userinfo.id))
      ) {
        return res.redirect("/login?prompt=none");
      }

      let theme = indexjs.get(req);

      // Check must-be-logged-in pages
      if (
        theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname) &&
        (!req.session.userinfo || !req.session.pterodactyl)
      ) {
        return res.redirect("/login");
      }

      // Check must-be-admin pages
      if (theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
        const renderData = await indexjs.renderdataeval(req, theme);
        res.render(theme.settings.index, renderData);
        return;
      }

      // Render normal pages
      const renderData = await indexjs.renderdataeval(req, theme);
      res.render(theme.settings.index, renderData);
    } catch (err) {
      console.log(err);
      res.render("500.ejs", { err });
    }
  });

  // Serve static assets
  app.use("/assets", express.static("./assets"));
  app.use("/preline", express.static("./node_modules/preline"));
};