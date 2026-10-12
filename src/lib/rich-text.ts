import sanitizeHtml from "sanitize-html";

/**
 * The HTML a page or blog post may hold, enforced with sanitize-html.
 *
 * The editor produces a small set of tags (headings, lists, links, quotes,
 * images); anything else that arrives, from a pasted document or a hand-built
 * API request, is dropped before it is stored, and dropped again when it is
 * rendered, so a record written before a rule changed is held to the new one.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "h2",
    "h3",
    "h4",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "hr",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    a: (tagName, attribs) => {
      const external = attribs.target === "_blank";
      return {
        tagName,
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {}),
          ...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}),
        },
      };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
};

/** The rich text with every tag, attribute and address the storefront does not allow taken out. */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** True when the rich text has no words or images in it, such as `<p></p>`. */
export function isBlankRichText(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: ["img"], allowedAttributes: { img: ["src"] } }).trim() === "";
}
