import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getUserByEmail } from "@/lib/data";
import type { User } from "@/lib/types";

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
 * Two credentials providers:
 *
 * - `password` is the real one: email plus password, checked with bcrypt.
 * - `persona` backs the one-click demo buttons on /login and the
 *   "accepted an invitation" email box. It takes an email and no password,
 *   which is deliberate for this demo workspace and is the same thing the
 *   buttons did before — the point of the move is that the resulting session is
 *   a signed Auth.js token rather than a cookie anyone could write by hand.
 */

/** Only hashes bcrypt produced can be checked; invited accounts hold a random placeholder. */
function hasUsablePassword(user: User): boolean {
  return typeof user.password === "string" && user.password.startsWith("$2");
}

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
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
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
        if (!email) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
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
