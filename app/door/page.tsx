import { FEE_RUPEES } from "@/lib/config";
import { isDoorAuthed } from "@/lib/doorAuth";
import DoorClient from "./DoorClient";
import PinForm from "./PinForm";

export default async function DoorPage() {
  return <main>{(await isDoorAuthed()) ? <DoorClient fee={FEE_RUPEES} /> : <PinForm />}</main>;
}
