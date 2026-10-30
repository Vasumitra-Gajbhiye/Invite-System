import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import EventDetails from "@/app/EventDetails";
import { EVENT, FEE_RUPEES } from "@/lib/config";
import { guests } from "@/lib/db";
import { syncPayment } from "@/lib/guests";
import skull from "@/public/skull.png";
import PayButton from "./PayButton";

export default async function InvitePage(props: PageProps<"/i/[token]">) {
  const { token } = await props.params;
  const guest = await (await guests()).findOne({ token });
  if (!guest) notFound();
  // Catches payments where the tab closed before verify ran and the webhook hasn't landed.
  if (!guest.paid && guest.razorpayOrderIds?.length) guest.paid = await syncPayment(guest);

  const qr = await QRCode.toDataURL(guest.token, {
    width: 300,
    margin: 2,
    color: { dark: "#170404", light: "#ece0c8" },
  });

  return (
    <main className="poster">
      <Image src={skull} alt="" className="skull skull-small" priority sizes="200px" />
      <h1 className="guest-name">{guest.name},</h1>
      <p className="script summoned">you&rsquo;re summoned.</p>
      <p className="guest-meta">
        {guest.rollNo} · {guest.program}
      </p>

      <div className="stamp-wrap">
        {guest.checkedInAt ? (
          <span className="stamp">Checked in</span>
        ) : guest.paid ? (
          <span className="stamp">Paid</span>
        ) : (
          <span className="stamp stamp-unpaid">Unpaid · ₹{FEE_RUPEES}</span>
        )}
      </div>

      {!guest.paid && <PayButton token={guest.token} name={guest.name} fee={FEE_RUPEES} />}

      <section className="panel">
        <h2 className="panel-title">Your entry pass</h2>
        <div className="qr-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Entry QR code" width={300} height={300} />
        </div>
        <p className="note">
          Show this at the door. Bookmark this page or screenshot the pass.
          {!guest.paid && ` Not paid yet? You can also pay ₹${FEE_RUPEES} at the door.`}
        </p>
      </section>

      <h2 className="title title-small">{EVENT.name}</h2>
      <p className="script tagline">{EVENT.tagline}</p>
      <EventDetails />
      <p className="lure">{EVENT.lure[1]}</p>
      <p className="dress">Dress code: {EVENT.dressCode}</p>
    </main>
  );
}
