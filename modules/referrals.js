const indexjs = require("../app.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const ejs = require("ejs");
const fetch = require('node-fetch');

/* Ensure platform release target is met */
const garfanaModule = { 
  name: "Referrals (legacy)", 
  api_level: 1, 
  target_platform: "0.8.0"
};

/* Module */
module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {

  // Generate a referral code
  app.get('/generate', async (req, res) => {
    if (!req.session) return res.redirect("/login");
    if (!req.session.pterodactyl) return res.redirect("/login");

    if (!req.query.code) {
      return res.redirect('../account?err=INVALIDCODE');
    }

    let referralCode = req.query.code;

    // Validate the referral code
    if(referralCode.length > 15 || referralCode.includes(" ")) {
      return res.redirect('../referrals?err=INVALIDCODE');
    }

    // Check if the referral code already exists
    if(await db.get(referralCode)) {
      return res.redirect('../referrals?err=ALREADYEXISTS');
    }

    // Save the referral code along with user info
    await db.set(referralCode, {
      userId: req.session.userinfo.id,
      createdAt: new Date()
    });

    // Redirect to referral page with success
    res.redirect('../referrals?err=none');
  });

  // Claim a referral code
  app.get('/claim', async (req, res) => {
    if (!req.session) return res.redirect("/login");
    if (!req.session.pterodactyl) return res.redirect("/login");

    if (!req.query.code) {
      return res.redirect('../account?err=INVALIDCODE');
    }

    const referralCode = req.query.code;

    // Retrieve the referral code
    const referral = await db.get(referralCode);

    if (!referral) {
      return res.redirect('../account?err=INVALIDCODE');
    }

    // Check if user already claimed a code
    if (await db.get("referral-" + req.session.userinfo.id) === "1") {
      return res.redirect('../account?err=CANNOTCLAIM');
    }

    // Check if user is trying to claim their own code
    if (referral.userId === req.session.userinfo.id) {
      return res.redirect('../account?err=CANNOTCLAIM');
    }

    // Award referral bonus
    const ownercoins = await db.get("coins-" + referral.userId) || 0;
    const usercoins = await db.get("coins-" + req.session.userinfo.id) || 0;

    await db.set("coins-" + referral.userId, ownercoins + 80);
    await db.set("coins-" + req.session.userinfo.id, usercoins + 250);
    await db.set("referral-" + req.session.userinfo.id, 1);

    // Redirect to account page after claiming
    res.redirect('../account?err=none');
  });

};