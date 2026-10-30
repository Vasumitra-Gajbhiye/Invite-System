import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { EVENT, FEE_RUPEES } from "@/lib/config";
import { guests } from "@/lib/db";
import { syncPayment } from "@/lib/guests";
import PayButton from "./PayButton";

export default async function InvitePage(props: PageProps<"/i/[token]">) {
  const { token } = await props.params;
  const guest = await (await guests()).findOne({ token });
  if (!guest) notFound();
  // Catches payments where the tab closed before verify ran and the webhook hasn't landed.
  if (!guest.paid && guest.razorpayOrderIds?.length) guest.paid = await syncPayment(guest);

  const qr = await QRCode.toDataURL(guest.token, { width: 300, margin: 2 });

  return (
    <main>
      <h1>{guest.name}, you&apos;re summoned.</h1>
      <p>{EVENT.tagline}</p>
      <p>
        <b>{EVENT.name}</b>
        <br />
        {EVENT.date}, {EVENT.time}
        <br />
        {EVENT.venue}
        <br />
        Dress code: {EVENT.dressCode}
      </p>

      <p>
        Status:{" "}
        {guest.checkedInAt ? "Checked in ✅" : guest.paid ? "Paid ✅" : `Unpaid ⏳ (₹${FEE_RUPEES})`}
      </p>

      {!guest.paid && (
        <PayButton token={guest.token} name={guest.name} email={guest.email} phone={guest.phone} fee={FEE_RUPEES} />
      )}

      <h2>Your entry pass</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Entry QR code" width={300} height={300} />
      <p>
        Show this QR at the door. Bookmark this page or screenshot the QR.
        {!guest.paid && ` Not paid yet? You can also pay ₹${FEE_RUPEES} at the door.`}
      </p>
    </main>
  );
}
