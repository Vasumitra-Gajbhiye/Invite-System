# Invite-System

Halloween invite + door check-in. Next.js on Vercel, MongoDB, Razorpay.

## How it works

- **`/`**: open signup (name, phone, email). Share this link in the group.
- **`/i/<token>`**: the guest's personal invite. It shows a Pay ₹95 button (Razorpay Checkout) and their entry QR. The QR holds only a random 24-char token.
- **`/door`**: PIN-protected scanner for the volunteer's phone.
  - 🟢 **LET IN**: the guest has paid, and the scan checks them in.
  - 🟠 **ALREADY CHECKED IN**: this QR has already been used.
  - 🔴 **NOT PAID**: shows a Razorpay UPI QR for ₹95. The screen turns green on its own once the payment lands. If the QR Codes API isn't enabled on the account, it falls back to a Razorpay Payment Link shown as a QR. **Paid cash instead** marks the guest paid and checks them in.
  - **Find guest**: search by name or phone, for anyone without their QR.

Payments are confirmed three ways, so a single failure doesn't block entry:
1. The Checkout signature is verified right after an online payment.
2. Razorpay webhooks.
3. The server polls Razorpay directly from the door screen and the invite page.

## Setup

1. **MongoDB URI**: put the database name after the host and before the `?`:
   ```
   mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/iimb-invite?retryWrites=true&w=majority
   ```
   In Atlas → Network Access, allow `0.0.0.0/0`, because Vercel has no fixed IPs.
2. **Env vars** (in Vercel and in `.env.local` for local dev). See `.env.example`:
   `MONGODB_URI`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DOOR_PIN` (use 6+ digits).
3. **Razorpay webhook**: Dashboard → Webhooks → Add:
   - URL: `https://<your-site>/api/razorpay/webhook`
   - Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `qr_code.credited`, `payment_link.paid`

   If Vercel Deployment Protection is on, make sure it doesn't block this route.
4. **Payment capture**: keep auto-capture on (the Razorpay default).
5. Edit the event details in `lib/config.ts`.

## Local dev

```
npm install
npm run dev
```

## Before the event

Make one real ₹95 payment end to end on the actual door phone, both online and at the door, then refund it from the Razorpay dashboard.
