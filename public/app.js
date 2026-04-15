(() => {
  const STORAGE_CART_KEY = "miniEcomCartV1";

  const PRODUCTS = [
    {
      sku: "SKU-A1",
      name: "Aurora Hoodie",
      description: "Soft fleece, warm fit, everyday comfort.",
      priceCents: 4599,
    },
    {
      sku: "SKU-B2",
      name: "Nimbus T-Shirt",
      description: "Breathable cotton blend with a clean look.",
      priceCents: 1999,
    },
    {
      sku: "SKU-C3",
      name: "Nebula Cap",
      description: "Adjustable strap with a structured crown.",
      priceCents: 1299,
    },
    {
      sku: "SKU-D4",
      name: "Orbit Socks (2-pack)",
      description: "Cushioned sole and reinforced heel.",
      priceCents: 999,
    },
    {
      sku: "SKU-E5",
      name: "Pulse Water Bottle",
      description: "Insulated stainless steel, leakproof lid.",
      priceCents: 2499,
    },
    {
      sku: "SKU-F6",
      name: "Comet Tote Bag",
      description: "Sturdy canvas tote for daily carry.",
      priceCents: 1899,
    },
  ];

  const els = {
    statusBar: document.getElementById("statusBar"),
    viewRoot: document.getElementById("viewRoot"),
    cartCount: document.getElementById("cartCount"),
    navItems: document.getElementById("navItems"),
    navCart: document.getElementById("navCart"),
    navCheckout: document.getElementById("navCheckout"),
  };

  let stripe = null;
  let elements = null;
  let cardElement = null;
  let stripeInitPromise = null;
  let cardMounted = false;

  function setStatus(message, kind = "info") {
    if (!message) {
      els.statusBar.textContent = "";
      return;
    }
    const prefix =
      kind === "error" ? "Error: " : kind === "success" ? "Success: " : "";
    els.statusBar.textContent = `${prefix}${message}`;
  }

  function formatMoney(cents, currency = "usd") {
    const v = cents / 100;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(v);
  }

  function getCart() {
    try {
      const raw = localStorage.getItem(STORAGE_CART_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setCart(cart) {
    localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cart));
  }

  function cartToLineItems(cartObj) {
    const items = [];
    for (const [sku, qty] of Object.entries(cartObj)) {
      const product = PRODUCTS.find((p) => p.sku === sku);
      const safeQty = Number(qty);
      if (!product || !Number.isFinite(safeQty) || safeQty <= 0) continue;
      items.push({ sku, name: product.name, unitPriceCents: product.priceCents, qty: safeQty });
    }
    return items;
  }

  function cartTotalCents(cartObj) {
    return cartToLineItems(cartObj).reduce((sum, it) => sum + it.unitPriceCents * it.qty, 0);
  }

  function setNavState() {
    const cart = getCart();
    const count = Object.values(cart).reduce((sum, qty) => sum + Number(qty || 0), 0);
    els.cartCount.textContent = String(count);
    els.navCheckout.disabled = count <= 0;
  }

  function goTo(view) {
    if (view !== "checkout" && cardElement && cardMounted) {
      try {
        cardElement.unmount();
      } catch {
        // Best-effort only; remounting will happen on next checkout.
      }
      cardMounted = false;
    }
    if (view === "items") renderItemsView();
    if (view === "cart") renderCartView();
    if (view === "checkout") renderCheckoutView();
  }

  function renderItemsView() {
    setStatus("");
    const root = els.viewRoot;
    root.innerHTML = `
      <div class="grid">
        ${PRODUCTS.map((p) => `
          <div class="productCard">
            <h3 class="productTitle">${p.name}</h3>
            <p class="productDesc">${p.description}</p>
            <div class="productFooter">
              <span class="pill">${formatMoney(p.priceCents)}</span>
              <button class="btn btn--primary" data-add="${p.sku}">Add to cart</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    for (const btn of root.querySelectorAll("[data-add]")) {
      btn.addEventListener("click", () => {
        const sku = btn.getAttribute("data-add");
        const cart = getCart();
        cart[sku] = Number(cart[sku] || 0) + 1;
        setCart(cart);
        setNavState();
        setStatus("Added to cart.", "success");
      });
    }
  }

  function renderCartView() {
    setStatus("");
    const cart = getCart();
    const items = cartToLineItems(cart);
    const root = els.viewRoot;

    if (items.length === 0) {
      root.innerHTML = `
        <div class="panel">
          <h2>Your cart is empty</h2>
          <div class="note">Add something from the Items page to checkout.</div>
          <div style="margin-top: 12px;"><button class="btn btn--primary" id="emptyGo">Go to items</button></div>
        </div>
      `;
      root.querySelector("#emptyGo").addEventListener("click", () => goTo("items"));
      return;
    }

    const totalCents = cartTotalCents(cart);
    root.innerHTML = `
      <div class="panel">
        <h2>Your cart</h2>
        ${items.map((it) => `
          <div class="cartRow">
            <div>
              <div class="cartRow__title">${it.name}</div>
              <div class="cartRow__meta">${formatMoney(it.unitPriceCents)} each</div>
            </div>
            <div class="qty" aria-label="Quantity controls for ${it.name}">
              <button class="stepBtn" data-dec="${it.sku}" type="button">-</button>
              <div class="qtyVal">${it.qty}</div>
              <button class="stepBtn" data-inc="${it.sku}" type="button">+</button>
            </div>
            <div style="min-width: 110px; text-align:right;">
              <div style="font-weight:600;">${formatMoney(it.unitPriceCents * it.qty)}</div>
              <div style="margin-top:6px;">
                <button class="btn btn--danger" data-remove="${it.sku}" type="button">Remove</button>
              </div>
            </div>
          </div>
        `).join("")}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 10px;">
          <div>
            <div class="note">Total</div>
            <div style="font-weight:700; font-size: 18px;">${formatMoney(totalCents)}</div>
          </div>
          <button class="btn btn--primary" id="goCheckout" type="button">Checkout</button>
        </div>
      </div>
    `;

    root.querySelector("#goCheckout").addEventListener("click", () => goTo("checkout"));

    root.querySelectorAll("[data-inc]").forEach((b) => {
      b.addEventListener("click", () => {
        const sku = b.getAttribute("data-inc");
        const cart2 = getCart();
        cart2[sku] = Number(cart2[sku] || 0) + 1;
        setCart(cart2);
        setNavState();
        renderCartView();
      });
    });
    root.querySelectorAll("[data-dec]").forEach((b) => {
      b.addEventListener("click", () => {
        const sku = b.getAttribute("data-dec");
        const cart2 = getCart();
        cart2[sku] = Math.max(0, Number(cart2[sku] || 0) - 1);
        if (cart2[sku] <= 0) delete cart2[sku];
        setCart(cart2);
        setNavState();
        renderCartView();
      });
    });
    root.querySelectorAll("[data-remove]").forEach((b) => {
      b.addEventListener("click", () => {
        const sku = b.getAttribute("data-remove");
        const cart2 = getCart();
        delete cart2[sku];
        setCart(cart2);
        setNavState();
        renderCartView();
      });
    });
  }

  async function initStripeIfNeeded() {
    if (stripeInitPromise) {
      if (!cardMounted && cardElement) {
        cardElement.mount("#card-element");
        cardMounted = true;
      }
      return stripeInitPromise;
    }
    stripeInitPromise = (async () => {
      const cfg = await fetch("/api/config").then((r) => r.json());
      if (!window.Stripe) throw new Error("Stripe.js failed to load.");
      stripe = window.Stripe(cfg.stripePublishableKey);
      elements = stripe.elements();
      cardElement = elements.create("card", {
        hidePostalCode: true,
      });
      cardElement.mount("#card-element");
      cardMounted = true;
      cardElement.on("change", (event) => {
        if (event.error) setStatus(event.error.message || "Card error.", "error");
      });
    })();
    return stripeInitPromise;
  }

  async function createOrderFromPaidPayment({ paymentIntentId, pendingOrder }) {
    const payload = {
      paymentIntentId,
      items: pendingOrder.items,
      totalCents: pendingOrder.totalCents,
      currency: pendingOrder.currency,
    };
    const resp = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || "Order creation failed.");
    }
    return data.order;
  }

  function renderSuccessView(order) {
    setStatus("");
    const root = els.viewRoot;
    const isCod = order.paymentMethod === "cod";
    const paymentPill =
      !isCod && order.paymentIntentId
        ? `<span class="pill">${order.paymentIntentId}</span>`
        : !isCod
          ? `<span class="pill">Stripe</span>`
          : `<span class="pill">COD</span>`;
    root.innerHTML = `
      <div class="successBox">
        <h2 style="margin:0 0 8px 0;">Order placed successfully</h2>
        <div class="note">
          Order ID: <strong>${order.id}</strong><br/>
          ${isCod ? "Total: " : "Paid: "}<strong>${formatMoney(order.totalCents, order.currency)}</strong><br/>
          Payment: ${paymentPill}
        </div>
        <div style="margin-top: 14px;">
          <button class="btn btn--primary" id="backToItems" type="button">Continue shopping</button>
        </div>
      </div>
    `;
    root.querySelector("#backToItems").addEventListener("click", () => {
      setCart({});
      sessionStorage.removeItem("pendingOrder");
      setNavState();
      goTo("items");
    });
  }

  function renderCheckoutView() {
    const cart = getCart();
    const items = cartToLineItems(cart);
    if (items.length === 0) {
      setStatus("Your cart is empty.", "error");
      return goTo("items");
    }

    const totalCents = cartTotalCents(cart);
    const currency = "inr";

    setStatus("Complete payment to place your order.");
    els.viewRoot.innerHTML = `
      <div class="checkout">
        <div class="panel">
          <h2>Payment</h2>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom: 12px;">
            <button class="btn" type="button" data-method="card" id="mCard">Card (3DS OTP)</button>
            <button class="btn" type="button" data-method="upi" id="mUpi">UPI</button>
            <button class="btn" type="button" data-method="cod" id="mCod">Cash on Delivery</button>
          </div>

          <div id="methodCard">
            <div class="note" style="margin-bottom: 10px;">
              Test OTP flow (3DS): use card <strong>4000 0000 0000 3220</strong>.<br/>
              OTP: <strong>123456</strong>. Enter any future expiry and any CVC.
            </div>
            <div class="note" style="margin-bottom: 12px;">Card details</div>
            <div id="card-element"></div>
            <div style="margin-top: 12px; display:flex; gap:10px; align-items:center;">
              <button class="btn btn--primary" id="payBtn" type="button">Submit</button>
              <button class="btn" id="backToCart" type="button">Back to cart</button>
            </div>
            <div id="authHint" class="note" style="margin-top: 12px;"></div>
          </div>

          <div id="methodUpi" style="display:none;">
            <div class="note" style="margin-bottom: 12px;">
              Pay using UPI via <strong>Stripe Checkout</strong>. You will be redirected to complete the UPI authorization.
            </div>
            <div style="margin-top: 12px; display:flex; gap:10px; align-items:center;">
              <button class="btn btn--primary" id="payUpiBtn" type="button">Pay with UPI</button>
              <button class="btn" id="backToCartUpi" type="button">Back to cart</button>
            </div>
            <div id="upiHint" class="note" style="margin-top: 12px;"></div>
          </div>

          <div id="methodCod" style="display:none;">
            <div class="note" style="margin-bottom: 12px;">
              Cash on Delivery: no online payment. You’ll place the order now and pay when it arrives.
            </div>
            <div style="margin-top: 12px; display:flex; gap:10px; align-items:center;">
              <button class="btn btn--primary" id="placeCodBtn" type="button">Place order (COD)</button>
              <button class="btn" id="backToCartCod" type="button">Back to cart</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <h2>Order summary</h2>
          ${items.map((it) => `
            <div style="display:flex; justify-content:space-between; margin: 8px 0;">
              <div style="max-width: 58%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${it.name} <span class="note">x${it.qty}</span></div>
              <div style="font-weight:600;">${formatMoney(it.unitPriceCents * it.qty, currency)}</div>
            </div>
          `).join("")}
          <div style="border-top:1px solid var(--border); margin-top: 12px; padding-top: 12px; display:flex; justify-content:space-between;">
            <div class="note">Total</div>
            <div style="font-weight:700; font-size: 18px;">${formatMoney(totalCents, currency)}</div>
          </div>
        </div>
      </div>
    `;

    let selectedMethod = "card";

    const methodCard = els.viewRoot.querySelector("#methodCard");
    const methodUpi = els.viewRoot.querySelector("#methodUpi");
    const methodCod = els.viewRoot.querySelector("#methodCod");

    function showMethod(method) {
      selectedMethod = method;
      const cardShown = method === "card";
      const upiShown = method === "upi";
      const codShown = method === "cod";

      methodCard.style.display = cardShown ? "block" : "none";
      methodUpi.style.display = upiShown ? "block" : "none";
      methodCod.style.display = codShown ? "block" : "none";

      els.viewRoot.querySelectorAll("[data-method]").forEach((btn) => {
        btn.classList.toggle("btn--primary", btn.getAttribute("data-method") === method);
      });
    }

    showMethod("card");

    els.viewRoot.querySelectorAll("[data-method]").forEach((btn) => {
      btn.addEventListener("click", () => showMethod(btn.getAttribute("data-method")));
    });

    const payBtn = els.viewRoot.querySelector("#payBtn");
    const backToCart = els.viewRoot.querySelector("#backToCart");
    const authHint = els.viewRoot.querySelector("#authHint");
    const payUpiBtn = els.viewRoot.querySelector("#payUpiBtn");
    const backToCartUpi = els.viewRoot.querySelector("#backToCartUpi");
    const upiHint = els.viewRoot.querySelector("#upiHint");
    const placeCodBtn = els.viewRoot.querySelector("#placeCodBtn");
    const backToCartCod = els.viewRoot.querySelector("#backToCartCod");

    backToCart.addEventListener("click", () => goTo("cart"));
    backToCartUpi.addEventListener("click", () => goTo("cart"));
    backToCartCod.addEventListener("click", () => goTo("cart"));

    payBtn.addEventListener("click", async () => {
      if (selectedMethod !== "card") return;
      payBtn.disabled = true;
      authHint.textContent = "";
      setStatus("Creating secure payment…");

      const cart2 = getCart();
      const pendingItems = cartToLineItems(cart2);
      const pendingTotalCents = cartTotalCents(cart2);
      const pendingOrder = { items: pendingItems, totalCents: pendingTotalCents, currency };
      sessionStorage.setItem("pendingOrder", JSON.stringify(pendingOrder));

      try {
        await initStripeIfNeeded();
        const resp = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: pendingTotalCents, currency }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Failed to create payment intent.");
        const { clientSecret } = data;

        setStatus("Waiting for authentication (OTP/3DS)…");
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        }, {
          // Stay on-page for 3DS whenever possible (avoids redirect hangs).
          redirect: "if_required",
        });

        if (result.error) {
          setStatus(result.error.message || "Payment failed.", "error");
          return;
        }

        const status = result.paymentIntent?.status;
        if (status === "succeeded") {
          const order = await createOrderFromPaidPayment({
            paymentIntentId: result.paymentIntent.id,
            pendingOrder: JSON.parse(sessionStorage.getItem("pendingOrder") || "null"),
          });
          setStatus("Order confirmed.", "success");
          sessionStorage.removeItem("pendingOrder");
          setCart({});
          setNavState();
          renderSuccessView(order);
          return;
        }

        if (status === "requires_action") {
          // Retry confirmation to trigger challenge on-page if needed.
          const actionResult = await stripe.confirmCardPayment(clientSecret, {}, { redirect: "if_required" });
          if (actionResult.error) {
            setStatus(actionResult.error.message || "Authentication failed.", "error");
            return;
          }
          if (actionResult.paymentIntent?.status === "succeeded") {
            const order = await createOrderFromPaidPayment({
              paymentIntentId: actionResult.paymentIntent.id,
              pendingOrder: JSON.parse(sessionStorage.getItem("pendingOrder") || "null"),
            });
            setStatus("Order confirmed.", "success");
            sessionStorage.removeItem("pendingOrder");
            setCart({});
            setNavState();
            renderSuccessView(order);
            return;
          }
        }

        authHint.textContent = `Payment status: ${status || "unknown"}. If stuck, click Submit again.`;
      } catch (err) {
        setStatus(err.message || "Checkout failed.", "error");
      } finally {
        payBtn.disabled = false;
      }
    });

    payUpiBtn.addEventListener("click", async () => {
      if (selectedMethod !== "upi") return;
      payUpiBtn.disabled = true;
      upiHint.textContent = "";
      setStatus("Redirecting to Stripe Checkout for UPI…");

      const cart2 = getCart();
      const pendingItems = cartToLineItems(cart2);
      const pendingTotalCents = cartTotalCents(cart2);
      const pendingOrder = { items: pendingItems, totalCents: pendingTotalCents, currency };
      sessionStorage.setItem("pendingOrder", JSON.stringify(pendingOrder));

      try {
        const resp = await fetch("/api/create-upi-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: pendingItems,
            totalCents: pendingTotalCents,
            currency,
            origin: window.location.origin,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || "Failed to create UPI checkout session.");
        if (!data.url) throw new Error("Stripe did not return a checkout URL.");
        window.location.href = data.url;
      } catch (err) {
        setStatus(err.message || "UPI failed.", "error");
      } finally {
        payUpiBtn.disabled = false;
      }
    });

    placeCodBtn.addEventListener("click", async () => {
      if (selectedMethod !== "cod") return;
      placeCodBtn.disabled = true;
      setStatus("Placing COD order…");

      const cart2 = getCart();
      const pendingItems = cartToLineItems(cart2);
      const pendingTotalCents = cartTotalCents(cart2);

      try {
        const resp = await fetch("/api/create-order-cod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: pendingItems,
            totalCents: pendingTotalCents,
            currency,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || "COD order creation failed.");

        const order = data.order;
        sessionStorage.removeItem("pendingOrder");
        setCart({});
        setNavState();
        renderSuccessView(order);
      } catch (err) {
        setStatus(err.message || "COD failed.", "error");
      } finally {
        placeCodBtn.disabled = false;
      }
    });

    // Initialize elements on view load (needed for card payments).
    initStripeIfNeeded().catch((e) => setStatus(e.message || "Stripe init failed.", "error"));
  }

  async function handleReturnFrom3DSIfAny() {
    const url = new URL(window.location.href);
    const clientSecret = url.searchParams.get("payment_intent_client_secret");
    if (!clientSecret) return;

    // Remove the param so refreshing doesn't keep trying.
    url.searchParams.delete("payment_intent_client_secret");
    history.replaceState({}, "", url.toString());

    try {
      setStatus("Completing secure authentication…");
      await initStripeIfNeeded();

      const paymentIntent = await stripe.retrievePaymentIntent(clientSecret);
      if (paymentIntent && paymentIntent.status === "succeeded") {
        const pendingOrderRaw = sessionStorage.getItem("pendingOrder");
        const pendingOrder = pendingOrderRaw ? JSON.parse(pendingOrderRaw) : null;
        if (!pendingOrder) throw new Error("Missing pending order details for this payment.");

        const order = await createOrderFromPaidPayment({
          paymentIntentId: paymentIntent.id,
          pendingOrder,
        });

        sessionStorage.removeItem("pendingOrder");
        setCart({});
        setNavState();
        renderSuccessView(order);
      } else {
        setStatus(`Payment not completed yet (status: ${paymentIntent?.status || "unknown"}).`, "error");
        goTo("checkout");
      }
    } catch (err) {
      setStatus(err.message || "Return flow failed.", "error");
    }
  }

  async function handleReturnFromUpiCheckoutIfAny() {
    const url = new URL(window.location.href);
    const checkoutSessionId = url.searchParams.get("checkout_session_id");
    if (!checkoutSessionId) return;

    // Remove so refreshing doesn't keep trying.
    url.searchParams.delete("checkout_session_id");
    url.searchParams.delete("upi");
    history.replaceState({}, "", url.toString());

    const pendingOrderRaw = sessionStorage.getItem("pendingOrder");
    if (!pendingOrderRaw) {
      setStatus("Missing pending order info for UPI. Please checkout again.", "error");
      return;
    }

    const pendingOrder = JSON.parse(pendingOrderRaw);

    try {
      setStatus("Finalizing UPI order…");
      const resp = await fetch("/api/create-order-from-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutSessionId,
          items: pendingOrder.items,
          totalCents: pendingOrder.totalCents,
          currency: pendingOrder.currency,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "UPI order finalization failed.");
      }

      const order = data.order;
      sessionStorage.removeItem("pendingOrder");
      setCart({});
      setNavState();
      renderSuccessView(order);
    } catch (err) {
      setStatus(err.message || "UPI return failed.", "error");
    }
  }

  // Navigation.
  els.navItems.addEventListener("click", () => goTo("items"));
  els.navCart.addEventListener("click", () => goTo("cart"));
  els.navCheckout.addEventListener("click", () => goTo("checkout"));

  // Boot.
  setNavState();
  renderItemsView();
  handleReturnFrom3DSIfAny().catch(() => {});
  handleReturnFromUpiCheckoutIfAny().catch(() => {});
})();

