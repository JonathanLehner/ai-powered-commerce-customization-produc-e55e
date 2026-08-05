import { notFound } from "next/navigation";

/** Any platform administration address that matches no page is a 404 inside the admin chrome. */
export default function AdminCatchAll(): never {
  notFound();
}
