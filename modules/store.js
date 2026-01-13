const indexjs = require("../app.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const ejs = require("ejs");
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");

/* Ensure platform release target is met */
const garfanaModule = { 
  name: "Resources Store", 
  api_level: 1, 
  target_platform: "0.8.0"
};

/* Module */
module.exports.garfanaModule = garfanaModule;

module.exports.load = async function (app, db) {

  // Helper function to purchase a resource
  async function buyResource(req, res, type) {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const amount = parseFloat(req.query.amount);
    const limits = settings.api.client.coins.store[type]; // Reads from config.toml
    if (!amount || isNaN(amount)) return res.send("Invalid amount");

    const userId = req.session.userinfo.id;
    let userCoins = await db.get(`coins-${userId}`) || 0;
    let resourceCap = await db.get(`${type}-${userId}`) || 0;

    const perUnit = limits.per;
    const cost = limits.cost * amount;

    if (userCoins < cost) return res.redirect("/?err=CANNOTAFFORD");

    await db.set(`coins-${userId}`, userCoins - cost);
    await db.set(`${type}-${userId}`, resourceCap + amount);

    let extra = await db.get(`extra-${userId}`) || { ram: 0, disk: 0, cpu: 0, servers: 0 };
    extra[type] += perUnit * amount;
    await db.set(`extra-${userId}`, extra);

    adminjs.suspend(userId);
    res.redirect("/?err=none");
  }

  // Map routes to resource types
  const routes = {
    "/buyram": "ram",
    "/buydisk": "disk",
    "/buycpu": "cpu",
    "/buyservers": "servers"
  };

  Object.entries(routes).forEach(([route, type]) => {
    app.get(route, async (req, res) => buyResource(req, res, type));
  });

  // Stripe integration (coins purchase)
  if (settings.api.client.coins.stripe.enabled) {
    const stripe = require("stripe")(settings.api.client.coins.stripe.secret_key);

    // Create payment intent for a package
    app.post("/api/create-payment-intent", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(401).json({ error: "Not authenticated" });

      const { packageName } = req.body;
      const pkg = settings.api.client.coins.stripe.packages[packageName];
      if (!pkg) return res.status(400).json({ error: "Invalid package" });

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(pkg.price * 100),
          currency: "usd",
          metadata: {
            userId: req.session.userinfo.id,
            coins: pkg.coins
          }
        });

        res.json({ clientSecret: paymentIntent.client_secret, package: pkg });
      } catch (err) {
        console.error("Stripe create payment error:", err);
        res.status(500).json({ error: "Error creating payment intent" });
      }
    });

    // Confirm payment
    app.post("/api/confirm-payment", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(401).json({ error: "Not authenticated" });

      try {
        const { paymentIntentId } = req.body;
        if (!paymentIntentId) return res.status(400).json({ error: "PaymentIntent ID required" });

        const processedKey = `stripe-processed-${paymentIntentId}`;
        const alreadyProcessed = await db.get(processedKey);
        if (alreadyProcessed) return res.json(alreadyProcessed);

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== "succeeded") return res.status(400).json({ error: "Payment not successful" });

        const userId = req.session.userinfo.id;
        const coinsToAdd = parseInt(paymentIntent.metadata.coins);

        let userCoins = await db.get(`coins-${userId}`) || 0;
        userCoins += coinsToAdd;
        await db.set(`coins-${userId}`, userCoins);

        const result = { success: true, coinsAdded: coinsToAdd, newBalance: userCoins };
        await db.set(processedKey, result);

        // Transaction history
        let transactions = await db.get(`transactions-${userId}`) || [];
        transactions.unshift({
          id: paymentIntentId,
          type: "coin_purchase",
          coins: coinsToAdd,
          status: "completed",
          date: new Date().toISOString()
        });
        if (transactions.length > 50) transactions = transactions.slice(0, 50);
        await db.set(`transactions-${userId}`, transactions);

        res.json(result);
      } catch (err) {
        console.error("Stripe confirm payment error:", err);
        res.status(500).json({ error: "Error confirming payment" });
      }
    });
  }
};