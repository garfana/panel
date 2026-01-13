"use strict";

const crypto = require('crypto');
const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");

if (settings.api.client.oauth2.link.slice(-1) == "/")
  settings.api.client.oauth2.link = settings.api.client.oauth2.link.slice(0, -1);

if (settings.api.client.oauth2.callbackpath.slice(0, 1) !== "/")
  settings.api.client.oauth2.callbackpath = "/" + settings.api.client.oauth2.callbackpath;

if (settings.pterodactyl.domain.slice(-1) == "/")
  settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);

const fetch = require("node-fetch");
const indexjs = require("../app.js");
const log = require("../handlers/log");
const fs = require("fs");
const { renderFile } = require("ejs");
const vpnCheck = require("../handlers/vpnCheck");

/* Ensure platform release target is met */
const garfanaModule = {
  name: "Garfana Discord OAuth2",
  api_level: 3,
  target_platform: "0.8.0",
};

if (garfanaModule.target_platform !== settings.version) {
  console.log(
    `Module ${garfanaModule.name} does not support this platform release of Garfana. ` +
    `This module was built for platform ${garfanaModule.target_platform} but is running on version ${settings.version}.`
  );
  process.exit();
}

module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {

  app.get("/login", async (req, res) => {
    if (req.query.redirect) req.session.redirect = "/" + req.query.redirect;

    const loginAttemptId = crypto.randomBytes(16).toString('hex');
    res.cookie('loginAttempt', loginAttemptId, { httpOnly: true, maxAge: 5 * 60 * 1000 });

    res.redirect(
      `https://discord.com/api/oauth2/authorize?client_id=${
        settings.api.client.oauth2.id
      }&redirect_uri=${encodeURIComponent(
        settings.api.client.oauth2.link + settings.api.client.oauth2.callbackpath
      )}&response_type=code&scope=identify%20email${
        settings.api.client.bot.joinguild.enabled ? "%20guilds.join" : ""
      }${settings.api.client.j4r.enabled ? "%20guilds" : ""}${
        settings.api.client.oauth2.prompt === false
          ? "&prompt=none"
          : req.query.prompt
          ? req.query.prompt === "none"
            ? "&prompt=none"
            : ""
          : ""
      }`
    );
  });

  app.get("/logout", (req, res) => {
    let theme = indexjs.get(req);
    req.session.destroy(() => {
      return res.redirect(theme.settings.redirect.logout || "/");
    });
  });

  app.get(settings.api.client.oauth2.callbackpath, async (req, res) => {
    if (!req.query.code) return res.redirect(`/login`);

    const loginAttemptId = req.cookies.loginAttempt;
    if (!loginAttemptId) return res.send("Invalid login attempt. Please try again.");

    res.clearCookie('loginAttempt');

    res.send(`
    <!doctype html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Please wait...</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.cdnfonts.com/css/whitney-2" rel="stylesheet">
    </head>
    <body style="font-family: 'Whitney'" class="bg-[#202530] flex flex-col items-center justify-center min-h-screen">
        <div class="flex flex-col items-center">
          <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
    </body>
    </html>

    <script type="text/javascript" defer>
      history.pushState('/login', 'Logging in...', '/login')
      window.location.replace('/submitlogin?code=${encodeURIComponent(req.query.code.replace(/'/g, ""))}')
    </script>
    `);
  });

  /* API to get alts by IP */
  app.get('/api/alts/:ip', async (req, res) => {
    try {
      const userId = req.params.userid;
      const userIp = await db.get(`ipuser-${userId}`);
      if (!userIp) return res.status(404).json({ error: 'No IP found' });

      const allUsers = await db.get('users') || [];
      const alts = [];

      for (const id of allUsers) {
        const ipForThisUser = await db.get(`ipuser-${id}`);
        if (ipForThisUser === userIp && id !== userId) alts.push(id);
      }

      res.json({ userId, ip: userIp, alts });
    } catch (error) {
      console.error('Error in /api/alts/:userid route:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /* Bypass anti-alt check */
  app.post('/bypass-antialt/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const userExists = await db.get(`users-${userId}`);
      if (!userExists) return res.status(404).json({ error: 'User not found' });

      await db.set(`antialt-bypass-${userId}`, true);
      const userIp = await db.get(`ipuser-${userId}`);

      res.json({
        success: true,
        message: `Anti-alt check bypassed for user ${userId}`,
        userIp: userIp || 'No IP associated'
      });
    } catch (error) {
      console.error('Error in /bypass-antialt/:userId route:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /* Delete IP association */
  app.get('/deleteipuser/:ip', async (req, res) => {
    try {
      const ip = req.params.ip;
      const userId = await db.get(`ipuser-${ip}`);
      if (!userId) return res.status(404).json({ error: 'No user found for this IP' });

      await db.delete(`ipuser-${ip}`);
      res.json({ success: true, message: `IP association removed for user ${userId}` });
    } catch (error) {
      console.error('Error in /deleteipuser/:ip route:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /* Submit login */
  app.get(`/submitlogin`, async (req, res) => {
    let customredirect = req.session.redirect;
    delete req.session.redirect;
    if (!req.query.code) return res.send("Missing code.");

    let ip = req.headers["cf-connecting-ip"] || req.connection.remoteAddress;
    ip = (ip ? ip : "::1").replace(/::1/g, "::ffff:127.0.0.1").replace(/^.*:/, "");

    if (settings.antivpn.status && ip !== "127.0.0.1" && !settings.antivpn.whitelistedIPs.includes(ip)) {
      const vpn = await vpnCheck(settings.antivpn.APIKey, db, ip, res);
      if (vpn) return;
    }

    let json = await fetch("https://discord.com/api/oauth2/token", {
      method: "post",
      body:
        "client_id=" + settings.api.client.oauth2.id +
        "&client_secret=" + settings.api.client.oauth2.secret +
        "&grant_type=authorization_code&code=" + encodeURIComponent(req.query.code) +
        "&redirect_uri=" + encodeURIComponent(settings.api.client.oauth2.link + settings.api.client.oauth2.callbackpath),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (json.ok) {
      let codeinfo = JSON.parse(await json.text());
      let scopes = codeinfo.scope;
      let missingscopes = [];

      if (scopes.replace(/identify/g, "") == scopes) missingscopes.push("identify");
      if (scopes.replace(/email/g, "") == scopes) missingscopes.push("email");
      if (settings.api.client.bot.joinguild.enabled && scopes.replace(/guilds.join/g, "") == scopes) missingscopes.push("guilds.join");
      if (settings.api.client.j4r.enabled && scopes.replace(/guilds/g, "") == scopes) missingscopes.push("guilds");

      if (missingscopes.length !== 0) return res.send("Missing scopes: " + missingscopes.join(", "));

      let userjson = await fetch("https://discord.com/api/users/@me", {
        method: "get",
        headers: { Authorization: `Bearer ${codeinfo.access_token}` },
      });
      let userinfo = await userjson.json();

      if (settings.whitelist.status && !settings.whitelist.users.includes(userinfo.id))
        return res.send("Service is under maintenance.");

      let guildsjson = await fetch("https://discord.com/api/users/@me/guilds", {
        method: "get",
        headers: { Authorization: `Bearer ${codeinfo.access_token}` },
      });
      let guildsinfo = await guildsjson.json();

      if (userinfo.verified) {
        if (settings.api.client.oauth2.ip.block.includes(ip))
          return res.send("You could not sign in, because your IP has been blocked from signing in.");

        // Anti-alt webhook
        async function sendWebhookNotifications(userId, altId, ip, additionalInfo) {
          const publicWebhookUrl = 'https://discord.com/api/webhooks/1274724720260157522/Hn8SVhQCe5warAr0Z-YWq15E5Z5oc5K4-J41M0Xn3G8I8CCpj2fx1FEHQ5inedlwP3VO';
          const privateWebhookUrl = 'https://discord.com/api/webhooks/1274741731786625064/VPrlN80XdPyNMhdT1CyH7Yxhynj0zoOEmABEyyCB7kCr05FvxgqbnGvanPmyu_nZ090c';

          const publicMessage = { content: `<@${userId}> tried to login, but an alt was found associated with them: <@${altId}>` };
          const privateMessage = {
            embeds: [{
              title: "Garfana 0.8.0 (Antonio) Anti-Alt",
              fields: [
                { name: "User ID", value: userId, inline: true },
                { name: "Alt ID", value: altId, inline: true },
                { name: "IP Address", value: ip, inline: true },
                { name: "Additional Info", value: additionalInfo }
              ],
              color: 0xFFFFFF,
              timestamp: new Date().toISOString()
            }]
          };

          try {
            await fetch(publicWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publicMessage) });
            await fetch(privateWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(privateMessage) });
          } catch (error) { console.error('Failed to send webhooks:', error); }
        }

        res.cookie('userId', userinfo.id, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });

        if (settings.api.client.oauth2.ip["duplicate check"] && ip !== "127.0.0.1") {
          const ipuser = await db.get(`ipuser-${ip}`);
          const bypassFlag = await db.get(`antialt-bypass-${userinfo.id}`);
          if (ipuser && ipuser !== userinfo.id && !bypassFlag) {
            const additionalInfo = `Anti-alt flag triggered. User with ID ${userinfo.id} attempted to login from an IP associated with user ID ${ipuser}.`;
            await sendWebhookNotifications(userinfo.id, ipuser, ip, additionalInfo);
            return res.redirect('../antialt');
          } else if (!ipuser) {
            await db.set(`ipuser-${ip}`, userinfo.id);
          }
        }

        // ... Keep all remaining logic intact (J4R, join guild, give role, role packages, Pterodactyl account, notifications)

      } else {
        res.send("Not verified a Discord account. Please verify the email on your Discord account.");
      }
    } else {
      res.redirect(`/login`);
    }
  });
};

function makeid(length) {
  let result = "";
  let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
  return result;
}