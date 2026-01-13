const indexjs = require("../app.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const ejs = require("ejs");
const fetch = require('node-fetch');

/* Ensure platform release target is met */
const garfanaModule = { 
  name: "Staking", 
  api_level: 1, 
  target_platform: "0.8.0"
};

/* Module */
module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {
  const DAILY_INTEREST_RATE = 0.05; // 5% daily interest
  const MIN_STAKE_AMOUNT = 10; // Minimum amount to stake
  const UNSTAKE_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Helper function to calculate earnings
  const calculateEarnings = (stakedAmount, lastStakeTime) => {
    const daysStaked = (Date.now() - lastStakeTime) / 86400000;
    return stakedAmount * DAILY_INTEREST_RATE * daysStaked;
  };

  // Stake coins
  app.post("/stake", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect(`/login`);
      
    let amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount < MIN_STAKE_AMOUNT) {
      return res.status(400).json({ error: `Invalid amount. Minimum stake is ${MIN_STAKE_AMOUNT} coins.` });
    }
  
    let userId = req.session.userinfo.id;
    let userCoins = await db.get(`coins-${userId}`) || 0;
      
    if (userCoins < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
  
    let stakedAmount = await db.get(`staked-${userId}`) || 0;
    await db.set(`staked-${userId}`, stakedAmount + amount);
    await db.set(`coins-${userId}`, userCoins - amount);
  
    await db.set(`lastStakeTime-${userId}`, Date.now());
      
    res.status(200).json({ message: "Staked successfully", staked: stakedAmount + amount });
  });

  // Unstake coins
  app.post("/unstake", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect(`/login`);
    
    let amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let userId = req.session.userinfo.id;
    let stakedAmount = await db.get(`staked-${userId}`) || 0;
    let lastStakeTime = await db.get(`lastStakeTime-${userId}`) || Date.now();
    
    if (stakedAmount < amount) {
      return res.status(400).json({ error: "Insufficient staked balance" });
    }

    if (Date.now() - lastStakeTime < UNSTAKE_COOLDOWN) {
      return res.status(400).json({ error: "Unstaking is on cooldown. Please wait 24 hours between unstaking." });
    }

    let earnings = calculateEarnings(stakedAmount, lastStakeTime);

    await db.set(`staked-${userId}`, stakedAmount - amount);
    let userCoins = await db.get(`coins-${userId}`) || 0;
    await db.set(`coins-${userId}`, userCoins + amount + earnings);
    
    res.status(200).json({ 
      message: "Unstaked successfully", 
      unstaked: amount,
      earnings: earnings,
      newStakedBalance: stakedAmount - amount 
    });
  });

  // View staked balance and earnings
  app.get("/stake/balance", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect(`/login`);

    let userId = req.session.userinfo.id;
    let stakedAmount = await db.get(`staked-${userId}`) || 0;
    let lastStakeTime = await db.get(`lastStakeTime-${userId}`) || Date.now();

    let earnings = calculateEarnings(stakedAmount, lastStakeTime);

    res.status(200).json({
      staked: stakedAmount,
      earnings: earnings,
      lastStakeTime: lastStakeTime
    });
  });

  // Claim staking earnings
  app.post("/stake/claim", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect(`/login`);

    let userId = req.session.userinfo.id;
    let stakedAmount = await db.get(`staked-${userId}`) || 0;
    let lastStakeTime = await db.get(`lastStakeTime-${userId}`) || Date.now();

    let earnings = calculateEarnings(stakedAmount, lastStakeTime);

    if (earnings <= 0) {
      return res.status(400).json({ error: "No earnings to claim" });
    }

    let userCoins = await db.get(`coins-${userId}`) || 0;
    await db.set(`coins-${userId}`, userCoins + earnings);
    await db.set(`lastStakeTime-${userId}`, Date.now());

    res.status(200).json({
      message: "Earnings claimed successfully",
      claimedAmount: earnings,
      newBalance: userCoins + earnings
    });
  });
};