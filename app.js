/**
 *                                           
 *     Garfana 0.8.0 (Antonio)
 *
 */

"use strict";

// Load logging.
require("./handlers/console.js")();

// Load packages.
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const chalk = require("chalk");
const axios = require("axios");
const arciotext = require("./handlers/afk.js");
const cluster = require("cluster");
const os = require("os");
const ejs = require("ejs");
const readline = require("readline");
const chokidar = require("chokidar");
global.Buffer = global.Buffer || require("buffer").Buffer;

if (typeof btoa === "undefined") {
  global.btoa = function (str) {
    return Buffer.from(str, "binary").toString("base64");
  };
}
if (typeof atob === "undefined") {
  global.atob = function (b64Encoded) {
    return Buffer.from(b64Encoded, "base64").toString("binary");
  };
}

// Load settings.
const loadConfig = require("./handlers/config");
const settings = loadConfig("./config.toml");

const defaultthemesettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustbeloggedin: [],
  mustbeadmin: [],
  variables: {},
};

/**
 * Renders data for the theme.
 */
async function renderdataeval(req, theme) {
  const JavaScriptObfuscator = require("javascript-obfuscator");
  let newsettings = loadConfig("./config.toml");

  let renderdata = {
    req,
    settings: newsettings,
    userinfo: req.session.userinfo,
    queued: req.session.userinfo
      ? await db.get(req.session.userinfo.id + "-queued")
      : {},
    packagename: req.session.userinfo
      ? (await db.get("package-" + req.session.userinfo.id)) ??
        settings.api.client.packages.default
      : null,
    extraresources: !req.session.userinfo
      ? null
      : (await db.get("extra-" + req.session.userinfo.id)) ?? {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0,
        },
    packages: req.session.userinfo
      ? settings.api.client.packages.list[
          (await db.get("package-" + req.session.userinfo.id)) ??
            settings.api.client.packages.default
        ]
      : null,
    coins:
      settings.api.client.coins.enabled === true
        ? req.session.userinfo
          ? (await db.get("coins-" + req.session.userinfo.id)) ?? 0
          : null
        : null,
    bal: req.session.userinfo
      ? (await db.get("bal-" + req.session.userinfo.id)) ?? 0
      : null,
    pterodactyl: req.session.pterodactyl,
    extra: theme.settings.variables,
    db,
  };

  renderdata.arcioafktext = JavaScriptObfuscator.obfuscate(`
    let everywhat = ${settings.api.afk.every};
    let gaincoins = ${settings.api.afk.coins};
    let wspath = "ws";
    ${arciotext}
  `).getObfuscatedCode();

  return renderdata;
}

module.exports.renderdataeval = renderdataeval;

// Load database
const Database = require("keyv");
const db = new Database(settings.database);
module.exports.db = db;

/* ===========================
   MASTER PROCESS
=========================== */

if (cluster.isMaster) {
  const asciiArt = fs.readFileSync("./handlers/ascii.txt", "utf8");
  const lines = asciiArt.split("\n");
  const step = 1 / (lines.length - 1);

  function interpolateColor(c1, c2, f) {
    return c1.map((v, i) => Math.round(v + f * (c2[i] - v)));
  }

  console.log("\n");
  lines.forEach((line, i) => {
    const color = interpolateColor([128, 128, 128], [255, 255, 255], i * step);
    console.log(chalk.rgb(...color)(line));
  });
  console.log("\n");

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;

  const prefix = chalk.gray.bold("master │ ");

  const spinner = setInterval(() => {
    process.stdout.write(
      "\r" + prefix + chalk.gray(spinnerFrames[frame++] + " Initializing Garfana...")
    );
    frame %= spinnerFrames.length;
  }, 100);

  setTimeout(() => {
    clearInterval(spinner);
    process.stdout.write(
      "\r" + prefix + chalk.gray("Initialization completed.\n")
    );
    startApp();
  }, 3000);

  function startApp() {
    const moduleFiles = fs
      .readdirSync("./modules")
      .filter((f) => f.endsWith(".js"));

    const runtime = typeof Bun !== "undefined" ? "Bun" : "Node.js";
    console.log(chalk.gray(`Running under ${runtime}`));

    if (runtime !== "Bun") {
      console.log(
        chalk.yellow(
          "Future versions of Garfana will require Bun. Please migrate."
        )
      );
    }

    console.log(chalk.gray(`Garfana ${settings.version} (${settings.platform_codename})`));
    console.log(chalk.gray('Family "Antonio"'));

    moduleFiles.forEach((file) => {
      const mod = require("./modules/" + file);
      if (!mod.load || !mod.garfanaModule) {
        console.log(
          chalk.red(`Module "${file}" is missing garfanaModule metadata.`)
        );
        process.exit(1);
      }
    });

    const workers = parseInt(settings.clusters) - 1;
    if (workers < 1 || workers > 48) {
      console.log(chalk.red("Invalid cluster count."));
      process.exit(1);
    }

    console.log(chalk.gray(`Forking ${workers} workers...`));
    for (let i = 0; i < workers; i++) cluster.fork();

    cluster.on("exit", () => cluster.fork());

    chokidar.watch("./modules").on("change", (p) => {
      console.log(chalk.yellow(`Reload triggered: ${p}`));
      for (const id in cluster.workers) cluster.workers[id].kill();
    });
  }
}

/* ===========================
   WORKER PROCESS
=========================== */

else {
  const express = require("express");
  const nocache = require("nocache");
  const app = express();
  require("express-ws")(app);

  app.set("view engine", "ejs");
  app.use("/assets", express.static(path.join(__dirname, "assets")));
  app.use(require("cookie-parser")());
  app.use(nocache());

  app.use((req, res, next) => {
    res.setHeader("X-Powered-By", "Garfana 0.8.0 (Antonio)");
    res.setHeader("X-Garfana", "v0.8.0");
    next();
  });

  const session = require("express-session");
  const SessionStore = require("./handlers/session");

  app.use(
    session({
      store: new SessionStore({ uri: settings.database }),
      secret: settings.website.secret,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  app.use(express.json({ limit: "500kb" }));
  app.use(express.urlencoded({ extended: true }));

  const indexjs = require("./app.js");
  const apifiles = fs.readdirSync("./modules").filter((f) => f.endsWith(".js"));

  apifiles.forEach((file) => {
    require("./modules/" + file).load(app, db);
  });

  app.all("*", async (req, res) => {
    const theme = indexjs.get(req);
    const data = await renderdataeval(req, theme);
    res.render(
      theme.settings.pages[req._parsedUrl.pathname.slice(1)] ??
        theme.settings.notfound,
      data
    );
  });

  app.listen(settings.website.port, async () => {
    await db.set("afkSessions", {});
    console.log(chalk.green("Garfana web cluster online"));
  });
}
