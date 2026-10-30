# Invite-System

Halloween invite + door check-in. Next.js on Vercel, MongoDB, Razorpay.

## How it works

- **`/`**: guests enter their roll number to get their invite. Only students on the class roster (`data/roster.csv`, imported with `scripts/import-roster.mjs`) have one. Share this link in the group.
- **`/i/<token>`**: the guest's personal invite. It shows a Pay ₹95 button (Razorpay Checkout) and their entry QR. The QR holds only a random 24-char token.
- **`/door`**: PIN-protected scanner for the volunteer's phone.
  Every result shows the name, roll number and program in large text, so the volunteer can check the face matches the pass.
  - 🟢 **LET IN**: the guest has paid, and the scan checks them in. **Wrong person? Undo check-in** reverses it if someone used another student's QR.
  - 🟠 **ALREADY CHECKED IN**: this QR has already been used.
  - 🔴 **NOT PAID**: shows a Razorpay UPI QR for ₹95. The screen turns green on its own once the payment lands. If the QR Codes API isn't enabled on the account, it falls back to a Razorpay Payment Link shown as a QR. **Paid via personal UPI** and **Paid cash** mark the guest paid and check them in, after a confirmation.
  - **Find guest**: search by name or roll number. Each row can be marked **UPI paid** or **Cash paid** (records the payment without checking in), or **Mark unpaid** for any payment, including Razorpay ones (this doesn't refund the money; refund from the Razorpay dashboard). Mark unpaid also clears the check-in and detaches the old Razorpay payment, so the guest is asked to pay again.
  - **History**: newest-first feed of every payment, check-in, payment QR and undo, with who did it. Each guest row has its own History too. The first time on each phone, volunteers are asked for their name.
  - **Download status CSV**: everyone's payment and check-in status, with the same log.

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
   `MONGODB_URI`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DOOR_PIN` (use 6+ digits), `PRICE` (entry fee in rupees, defaults to 95; redeploy after changing it).
3. **Razorpay webhook**: Dashboard → Webhooks → Add:
   - URL: `https://<your-site>/api/razorpay/webhook`
   - Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `qr_code.credited`, `payment_link.paid`

   If Vercel Deployment Protection is on, make sure it doesn't block this route.
4. **Payment capture**: keep auto-capture on (the Razorpay default).
5. Edit the event details in `lib/config.ts`.

## Class roster

`data/roster.csv` (gitignored) has one row per student, with no header: `program,serial,rollNo,name,Paid-or-blank`. "Paid" means they already paid by personal UPI. Sync it to the database:

```
node --env-file=.env scripts/import-roster.mjs            # dry run: shows what would change
node --env-file=.env scripts/import-roster.mjs --apply    # writes; backs up all guests to backups/ first
```

- New roll numbers get an invite. Changed names and programs are updated. A "Paid" cell marks the student paid via `personal-upi`.
- It never marks anyone unpaid, so rerunning after door or Razorpay payments is safe. Students removed from the sheet are reported, not deleted.
- If there are old phone/email signups, it stops and lists them (flagging any Razorpay payments). Add `--wipe` to delete them.

### Resetting to the sheet

To wipe test marks, check-ins and pending payments and make the database match `data/roster.csv` exactly:

```
node --env-file=.env scripts/reset-to-roster.mjs            # dry run: lists every change
node --env-file=.env scripts/reset-to-roster.mjs --apply    # backs up to backups/, then resets
```

Invite links (tokens) are kept. The dry run warns about any Razorpay payment that the reset would wipe.

## Local dev

```
npm install
npm run dev
```

## Before the event

Make one real ₹95 payment end to end on the actual door phone, both online and at the door, then refund it from the Razorpay dashboard.
