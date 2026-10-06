"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut as authSignOut } from "@/auth";
import { getUserByEmail, getUserById } from "@/lib/data";
import type { User } from "@/lib/types";

/** Where a person lands once signed in, by platform role. */
function landingFor(user: User): string {
  return user.platformRole === "platform_admin" ? "/admin" : "/app";
}

export async function signOut(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
}

/** Starts a session for a user id — used after an invitation is accepted. */
export async function signInUser(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) redirect("/login?error=unknown-user");
  // The caller redirects into the store itself, so only the cookie is wanted here.
  await signIn("persona", { email: user.email, redirect: false });
}

/** One-click sign-in used by the demo persona list on the login screen. */
export async function signInAs(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const user = await getUserByEmail(email);
  if (!user) redirect("/login?error=unknown-user");

  try {
    await signIn("persona", { email: user.email, redirectTo: landingFor(user) });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=unknown-user");
    throw error;
  }
}

/** Email and password sign-in, checked against the bcrypt hash on the user record. */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("password", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=bad-credentials");
    throw error;
  }

  const user = await getUserByEmail(email);
  redirect(user ? landingFor(user) : "/app");
}
