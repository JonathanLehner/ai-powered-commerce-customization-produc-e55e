import { notFound } from "next/navigation";

/** Any workspace address that matches no page is a 404 inside the workspace. */
export default function WorkspaceCatchAll(): never {
  notFound();
}
