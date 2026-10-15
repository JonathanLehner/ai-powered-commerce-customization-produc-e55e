import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { hasUsablePassword, isDemoPersona } from "@/lib/demo-personas";
import { getUserByEmail, getUserById } from "@/lib/data";
import { readSignInTicket } from "@/lib/sign-in-token";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/signed-in-hint";

/**
 * Staff authentication.
 *
 * Auth.js owns the session end to end: it issues and verifies the signed,
 * encrypted JWT cookie, so nothing here hand-rolls cookie handling. There is no
 * adapter because staff records live behind the ClawCorp DB API rather than in a
 * SQL database Auth.js can talk to, hence the "jwt" strategy — the cookie
 * carries the user id and every request loads the user from the API, so a role
 * change takes effect on the next page view instead of at the next sign-in.
 *
 * Three credentials providers:
 *
 * - `password` is the real one: email plus password, checked with bcrypt.
 * - `persona` backs the one-click demo buttons on /login. It takes an email and
 *   no password, so it only ever opens the seeded demo accounts: real agencies
 *   sign up with a password, and an email-only door to them would let anyone in.
 * - `ticket` signs someone in right after the server has verified them another
 *   way (accepting an invitation), with a short-lived HMAC ticket the server
 *   mints itself. See `lib/sign-in-token.ts`.
 */


function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add it to .env.local for local development and " +
        "provision it as a Worker secret for the deployment.",
    );
  }
  return secret;
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function normaliseEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Initialised lazily so the secret is read per request. On Cloudflare Workers
 * `process.env` is populated when a request arrives, not when the module is
 * evaluated, and a missing secret has to surface as a request error rather than
 * take the whole build down.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normaliseEmail(credentials?.email);
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user || !hasUsablePassword(user)) return null;
        if (!(await compare(password, user.password))) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "persona",
      name: "Demo persona",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = normaliseEmail(credentials?.email);
        if (!email || !isDemoPersona(email)) return null;

        const user = await getUserByEmail(email);
        // Never a platform administrator, even if one is added to the list by mistake.
        if (!user || user.platformRole === "platform_admin") return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "ticket",
      name: "Sign-in ticket",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(credentials) {
        const userId = await readSignInTicket(String(credentials?.ticket ?? ""));
        if (!userId) return null;

        const user = await getUserById(userId);
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  // The marketing pages' "Go to dashboard" link reads this; see `@/lib/signed-in-hint`.
  events: {
    async signIn() {
      (await cookies()).set(SIGNED_IN_HINT_COOKIE, "1", { path: "/", maxAge: SESSION_MAX_AGE, sameSite: "lax" });
    },
    async signOut() {
      (await cookies()).delete(SIGNED_IN_HINT_COOKIE);
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
}));
