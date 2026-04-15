# Mini E-commerce (Stripe test OTP)

Simple mini shopping site with:
- Items + Cart
- Stripe PaymentIntent checkout (Card / 3DS OTP)
- Stripe UPI checkout (redirect)
- Cash on Delivery (COD)
- Test 3D Secure (OTP) flow
- "Order placed successfully" screen after payment succeeds

## Setup
1. Install dependencies:
   - `npm install`
2. Create a `.env` file from `.env.example` and fill in your Stripe keys:
   - `STRIPE_SECRET_KEY` (test mode)
   - `STRIPE_PUBLISHABLE_KEY` (test mode)
3. Start the server:
   - `npm run dev`
4. Open:
   - `http://localhost:4242`

## Test OTP / 3DS flow
On the Checkout page, enter:
- Card number: `4000 0000 0000 3220`
- OTP: `123456`
- Any future expiry date and any CVC

Then click **Submit**. Complete the OTP challenge. After success, you will see:
**Order placed successfully**

## Test UPI
On Checkout, select **UPI** and click **Pay with UPI**.
Stripe will redirect to the UPI flow. After payment succeeds, you’ll be returned to the app with **Order placed successfully**.

## Test COD
On Checkout, select **Cash on Delivery** and click **Place order (COD)**.
You’ll immediately see **Order placed successfully** (no online payment).

