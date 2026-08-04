"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserByEmail } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
  secure: process.env.NODE_ENV === "production",
};

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Starts a session for a user id — used after an invitation is accepted. */
export async function signInUser(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, userId, COOKIE_OPTIONS);
}

/** One-click sign-in used by the demo persona list on the login screen. */
export async function signInAs(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const user = await getUserByEmail(email);
  if (!user) redirect("/login?error=unknown-user");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, user.id, COOKIE_OPTIONS);
  redirect(user.platformRole === "platform_admin" ? "/admin" : "/app");
}
