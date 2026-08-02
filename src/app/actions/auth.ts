"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserByEmail } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";

export interface AuthState {
  error?: string;
  field?: "email" | "password";
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
  secure: process.env.NODE_ENV === "production",
};

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  if (!email) return { error: "Enter your work email address.", field: "email" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That does not look like an email address.", field: "email" };
  }
  if (!password) return { error: "Enter your password.", field: "password" };

  const user = await getUserByEmail(email);
  if (!user || user.password !== password) {
    return { error: "We could not match that email and password.", field: "password" };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, user.id, COOKIE_OPTIONS);
  redirect(next.startsWith("/") ? next : "/app");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
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
