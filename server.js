const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Stripe = require("stripe");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4242;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY in environment (see .env.example).");
}
if (!stripePublishableKey) {
  throw new Error("Missing STRIPE_PUBLISHABLE_KEY in environment (see .env.example).");
}

// Let the Stripe SDK default the API version to avoid SDK/package compatibility issues.
const stripe = new Stripe(stripeSecretKey);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// In-memory store for demo purposes (no DB).
const orders = [];

app.get("/api/config", (req, res) => {
  res.json({
    stripePublishableKey,
    currencyDefault: "inr",
  });
});

app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency } = req.body || {};
    const safeAmount = Number(amount);
    const safeCurrency = String(currency || "inr").toLowerCase();

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount." });
    }
    if (!/^[a-z]{3}$/.test(safeCurrency)) {
      return res.status(400).json({ error: "Invalid currency." });
    }

    // Force 3DS/OTP for testing by requesting it on card payments.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: safeAmount,
      currency: safeCurrency,
      payment_method_types: ["card"],
      payment_method_options: {
        card: {
          request_three_d_secure: "any",
        },
      },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    return res.status(500).json({ error: "Failed to create payment intent." });
  }
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { paymentIntentId, items, totalCents, currency } = req.body || {};
    const safePaymentIntentId = String(paymentIntentId || "");
    const safeTotalCents = Number(totalCents);
    const safeCurrency = String(currency || "inr").toLowerCase();

    if (!safePaymentIntentId.startsWith("pi_")) {
      return res.status(400).json({ error: "Invalid paymentIntentId." });
    }
    if (!Number.isFinite(safeTotalCents) || safeTotalCents <= 0) {
      return res.status(400).json({ error: "Invalid totalCents." });
    }
    if (!/^[a-z]{3}$/.test(safeCurrency)) {
      return res.status(400).json({ error: "Invalid currency." });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(safePaymentIntentId);
    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        error: "Payment not completed yet. Please try again.",
        status: paymentIntent?.status,
      });
    }
    // Demo safety check: ensure the client is not sending a mismatched total.
    if (paymentIntent.amount !== safeTotalCents || paymentIntent.currency !== safeCurrency) {
      return res.status(400).json({
        error: "Payment amount mismatch. Please try checkout again.",
      });
    }

    const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      paymentMethod: "card",
      paymentIntentId: paymentIntent.id,
      currency: safeCurrency,
      totalCents: safeTotalCents,
      items: Array.isArray(items) ? items : [],
    };
    orders.push(order);

    return res.json({ order });
  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/create-order-cod", async (req, res) => {
  try {
    const { items, totalCents, currency } = req.body || {};
    const safeTotalCents = Number(totalCents);
    const safeCurrency = String(currency || "inr").toLowerCase();

    if (!Number.isFinite(safeTotalCents) || safeTotalCents <= 0) {
      return res.status(400).json({ error: "Invalid totalCents." });
    }
    if (!/^[a-z]{3}$/.test(safeCurrency)) {
      return res.status(400).json({ error: "Invalid currency." });
    }

    const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      paymentMethod: "cod",
      paymentIntentId: null,
      currency: safeCurrency,
      totalCents: safeTotalCents,
      items: Array.isArray(items) ? items : [],
    };
    orders.push(order);
    return res.json({ order });
  } catch (err) {
    console.error("create-order-cod error:", err);
    return res.status(500).json({ error: "Failed to create COD order." });
  }
});

app.post("/api/create-upi-checkout-session", async (req, res) => {
  try {
    const { items, totalCents, currency, origin } = req.body || {};
    const safeTotalCents = Number(totalCents);
    const safeCurrency = String(currency || "inr").toLowerCase();
    const safeOrigin = String(origin || "").trim() || `http://localhost:${PORT}`;

    if (!Number.isFinite(safeTotalCents) || safeTotalCents <= 0) {
      return res.status(400).json({ error: "Invalid totalCents." });
    }
    if (safeCurrency !== "inr") {
      return res.status(400).json({ error: "UPI requires INR currency." });
    }

    // Check minimum amount: Stripe requires at least $0.50 USD equivalent
    // For INR, approximately ₹50 (5000 paisa) to ensure conversion >= $0.50
    if (safeTotalCents < 5000) {
      return res.status(400).json({ error: "Amount too small. Minimum order is ₹50." });
    }

    const lineItems = Array.isArray(items)
      ? items
          .filter((it) => it && it.name && Number.isFinite(Number(it.unitPriceCents)) && Number(it.qty) > 0)
          .map((it) => ({
            quantity: Number(it.qty),
            price_data: {
              currency: safeCurrency,
              product_data: {
                name: String(it.name || "Item"),
              },
              unit_amount: Number(it.unitPriceCents),
            },
          }))
      : [];

    if (lineItems.length === 0) {
      return res.status(400).json({ error: "No items for checkout." });
    }

    // Redirect-based UPI: Stripe Checkout will show the UPI QR / approval flow.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["upi"],
      currency: safeCurrency,
      line_items: lineItems,
      success_url: `${safeOrigin}/?upi=1&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${safeOrigin}/?upi=0&checkout_session_id={CHECKOUT_SESSION_ID}`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("create-upi-checkout-session error:", err);
    return res.status(500).json({ error: "Failed to create UPI checkout session." });
  }
});

app.post("/api/create-order-from-checkout-session", async (req, res) => {
  try {
    const { checkoutSessionId, items, totalCents, currency } = req.body || {};
    const safeCheckoutSessionId = String(checkoutSessionId || "");
    const safeTotalCents = Number(totalCents);
    const safeCurrency = String(currency || "inr").toLowerCase();

    if (!safeCheckoutSessionId.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid checkoutSessionId." });
    }
    if (!Number.isFinite(safeTotalCents) || safeTotalCents <= 0) {
      return res.status(400).json({ error: "Invalid totalCents." });
    }
    if (safeCurrency !== "inr") {
      return res.status(400).json({ error: "UPI requires INR currency." });
    }

    const session = await stripe.checkout.sessions.retrieve(safeCheckoutSessionId);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ error: "Checkout not paid yet.", payment_status: session?.payment_status });
    }
    if (Number(session.amount_total) !== safeTotalCents) {
      return res.status(400).json({ error: "Checkout amount mismatch. Try again." });
    }

    const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      paymentMethod: "upi",
      paymentIntentId: session.payment_intent || null,
      currency: safeCurrency,
      totalCents: safeTotalCents,
      items: Array.isArray(items) ? items : [],
    };
    orders.push(order);
    return res.json({ order });
  } catch (err) {
    console.error("create-order-from-checkout-session error:", err);
    return res.status(500).json({ error: "Failed to create order from checkout session." });
  }
});

// Serve frontend.
app.use(express.static(path.join(__dirname, "public")));

// For SPA-ish routing, always return the homepage for non-API routes.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

