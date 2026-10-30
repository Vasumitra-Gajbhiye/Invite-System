import Image from "next/image";
import Link from "next/link";
import skull from "@/public/skull.png";

export default function NotFound() {
  return (
    <main className="poster">
      <Image src={skull} alt="" className="skull skull-small" sizes="200px" />
      <h1 className="title title-small">Vanished</h1>
      <p className="script tagline">This invite has slipped into the dark.</p>
      <p className="lure">The link may be wrong. Fetch your invite again with your roll number.</p>
      <Link href="/" className="btn">
        Back to the door
      </Link>
    </main>
  );
}
