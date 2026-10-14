/**
 * The header and footer settings: how the announcement bar, the header and the
 * footer are laid out, and which extras they carry. Kept on the page tree's
 * root node beside the header and footer copy, so they are drafted, versioned,
 * previewed and published with the page. Plain data, shared by the storefront
 * layout, the editor and the Admin API.
 */
import { fieldKit, type SectionField } from "./storefront-schema";

const { opts, toggle, select } = fieldKit;

export const SOCIAL_NETWORKS = ["instagram", "tiktok", "x", "youtube", "facebook", "pinterest"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

const socialKey = (network: SocialNetwork) => `social${network[0].toUpperCase()}${network.slice(1)}`;

export const LAYOUT_FIELDS: SectionField[] = [
  {
    key: "announcementCountdown",
    label: "Announcement countdown to",
    type: "datetime",
    help: "Shows a countdown in the announcement bar until this time.",
  },
  select("headerLayout", "Header layout", opts(["left", "Logo left"], ["center", "Logo centred"])),
  toggle("headerSticky", "Keep the header in view while scrolling"),
  toggle("headerTransparent", "Show the header over a full-bleed hero"),
  toggle("megaMenu", "Mega menu with collection photos"),
  select("footerLayout", "Footer layout", opts(["columns", "Columns"], ["centered", "Centred"])),
  toggle("footerNewsletter", "Newsletter sign-up in the footer"),
  toggle("footerPayments", "Payment methods in the footer"),
  toggle("footerTrust", "Trust badges above the footer"),
  ...SOCIAL_NETWORKS.map((network) => ({
    key: socialKey(network),
    label: `${network === "x" ? "X" : network[0].toUpperCase() + network.slice(1)} link`,
    type: "url" as const,
  })),
];

export const LAYOUT_DEFAULTS: Record<string, string | boolean> = {
  announcementCountdown: "",
  headerLayout: "left",
  headerSticky: true,
  headerTransparent: false,
  megaMenu: false,
  footerLayout: "columns",
  footerNewsletter: false,
  footerPayments: true,
  footerTrust: false,
  ...Object.fromEntries(SOCIAL_NETWORKS.map((network) => [socialKey(network), ""])),
};

export interface LayoutSettings {
  announcementCountdown: string;
  headerLayout: "left" | "center";
  headerSticky: boolean;
  headerTransparent: boolean;
  megaMenu: boolean;
  footerLayout: "columns" | "centered";
  footerNewsletter: boolean;
  footerPayments: boolean;
  footerTrust: boolean;
  social: { network: SocialNetwork; url: string }[];
}

function rootProps(tree: unknown): Record<string, unknown> {
  if (!tree || typeof tree !== "object") return {};
  return (tree as Record<string, { props?: Record<string, unknown> }>).ROOT?.props ?? {};
}

/** The raw settings of a page tree, every key present. */
export function layoutValues(tree: unknown): Record<string, string | boolean> {
  const props = rootProps(tree);
  return Object.fromEntries(
    LAYOUT_FIELDS.map((field) => {
      const value = props[field.key];
      const fallback = LAYOUT_DEFAULTS[field.key];
      return [field.key, typeof value === typeof fallback ? (value as string | boolean) : fallback];
    }),
  );
}

/** The settings of a page tree, as the storefront layout reads them. */
export function layoutSettings(tree: unknown): LayoutSettings {
  const values = layoutValues(tree);
  return {
    announcementCountdown: String(values.announcementCountdown),
    headerLayout: values.headerLayout === "center" ? "center" : "left",
    headerSticky: values.headerSticky !== false,
    headerTransparent: values.headerTransparent === true,
    megaMenu: values.megaMenu === true,
    footerLayout: values.footerLayout === "centered" ? "centered" : "columns",
    footerNewsletter: values.footerNewsletter === true,
    footerPayments: values.footerPayments !== false,
    footerTrust: values.footerTrust === true,
    social: SOCIAL_NETWORKS.map((network) => ({ network, url: String(values[socialKey(network)] ?? "") })).filter((s) =>
      /^https:\/\/\S+$/i.test(s.url),
    ),
  };
}
