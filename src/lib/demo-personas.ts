/**
 * The seeded demo accounts behind the one-click buttons on /login. They are
 * the only accounts that can be opened without a password: real agencies sign
 * up with one, and invited teammates set one when they accept.
 */
export const DEMO_PERSONAS = [
  { key: "alex", email: "alex@northlight.studio", name: "Alex Moreau", tone: "brand" },
  { key: "sam", email: "sam@northlight.studio", name: "Sam Okafor", tone: "iris" },
  { key: "ines", email: "ines@northlight.studio", name: "Inés Duarte", tone: "amber" },
  { key: "dana", email: "dana@northwind.example", name: "Dana Whitfield", tone: "slate" },
  { key: "priya", email: "ops@parcelith.com", name: "Priya Raman", tone: "green" },
] as const;

export function isDemoPersona(email: string): boolean {
  const address = email.trim().toLowerCase();
  return DEMO_PERSONAS.some((persona) => persona.email === address);
}

/** Only hashes bcrypt produced can be checked; invited accounts made before passwords were asked hold a random placeholder. */
export function hasUsablePassword(user: { password?: unknown }): boolean {
  return typeof user.password === "string" && user.password.startsWith("$2");
}
