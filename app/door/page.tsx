import { isDoorAuthed } from "@/lib/doorAuth";
import DoorClient from "./DoorClient";
import PinForm from "./PinForm";

export default async function DoorPage() {
  return <main>{(await isDoorAuthed()) ? <DoorClient /> : <PinForm />}</main>;
}
