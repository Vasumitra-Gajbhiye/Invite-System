import { FEE_RUPEES } from "@/lib/config";
import { doorVolunteer, isDoorAuthed } from "@/lib/doorAuth";
import DoorClient from "./DoorClient";
import PinForm from "./PinForm";

export default async function DoorPage() {
  return <main className="door">{(await isDoorAuthed()) ? <DoorClient fee={FEE_RUPEES} volunteer={await doorVolunteer()} /> : <PinForm />}</main>;
}
