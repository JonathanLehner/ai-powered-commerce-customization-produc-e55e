import { notFound } from "next/navigation";

/** Any address inside a store's workspace that matches no page is a 404 in that store. */
export default function StoreWorkspaceCatchAll(): never {
  notFound();
}
