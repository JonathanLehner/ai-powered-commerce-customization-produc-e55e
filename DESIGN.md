---
name: Parcelith
description: Multi-store product commerce, one calm zinc-and-teal workspace
colors:
  brand-teal: "#0b807c"
  brand-teal-deep: "#0d6663"
  brand-teal-bright: "#12a099"
  brand-teal-wash: "#effcfa"
  iris: "#6d5cf0"
  iris-deep: "#3d2fae"
  iris-wash: "#f1f0fe"
  ink: "#09090b"
  ink-soft: "#52525b"
  ink-muted: "#5f5f68"
  ink-strong: "#18181b"
  paper: "#ffffff"
  zinc-band: "#f4f4f5"
  sidebar: "#fafafa"
  hairline: "#e4e4e7"
  destructive: "#e7000b"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 2rem + 2vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label-mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  pill: "9999px"
spacing:
  card-sm: "12px"
  card: "16px"
  grid: "16px"
  split: "56px"
  section-y-mobile: "56px"
  section-y: "80px"
components:
  button-primary:
    backgroundColor: "{colors.brand-teal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
  section-muted:
    backgroundColor: "{colors.zinc-band}"
    padding: "{spacing.section-y} 24px"
---

# Design System: Parcelith

## Overview

**Creative North Star: "The Quiet Workbench"**

Parcelith is a tool for agencies running many branded stores, so the platform's own look stays out of the way: neutral zinc greys, white surfaces, 1px hairlines, one teal accent. The tokens are shadcn variables in `src/app/globals.css`; legacy names (`ink`, `inksoft`, `line`, `canvas`) resolve to the same values, so migrated and unmigrated screens share one palette. Light theme only: `dark:` is bound to a `.dark` ancestor the app never renders.

Storefronts are a separate world. They override `--primary`, `--font-heading-face`, button shape (`data-buttons`) and section density per store; everything below describes the platform (marketing, workspace, admin).

**Key Characteristics:**
- Zinc neutrals, a single teal voice, iris only as a labelling tone.
- Flat surfaces; hairlines and `ring-foreground/10` define edges, shadows are for overlays.
- Two densities: 16px base on marketing, 14px base on `[data-surface="workspace"]`.

## Colors

Cool zinc greys carrying one deep teal; contrast is checked per background, not per token.

### Primary
- **Parcelith Teal** (#0b807c, brand-600): `--primary`. Buttons, links, check ticks and icons on white. The lightest step of the scale that clears 4.5:1 on white.
- **Deep Teal** (#0d6663, brand-700): teal *text* on the zinc band (`bg-muted` sections), on `brand-50` washes, and as the brand stat accent. brand-600 drops to about 4.35:1 on #f4f4f5.
- **Bright Teal** (#12a099, brand-500): `--ring`, chart-1, the builder's selection outline. Never text.
- **Teal Wash** (#effcfa, brand-50) with brand-200 border and brand-800 text: the brand badge/tone.

### Secondary
- **Iris** (#6d5cf0, iris-500; deep #3d2fae, wash #f1f0fe): one of the workspace's seven semantic tones (`iris` badge: iris-50 / iris-200 / iris-800; stat accent iris-700). Not a second brand color.

### Neutral
- **Ink** (#09090b): `--foreground`, headings and primary copy.
- **Ink Soft** (#52525b): `--foreground-soft`, secondary prose between ink and muted.
- **Muted Ink** (#5f5f68): `--muted-foreground`, leads, body copy in cards, captions. Darkened from zinc-500 so it clears 4.5:1 on the zinc band as well as on white.
- **Paper** (#ffffff): background, card, popover.
- **Zinc Band** (#f4f4f5): `--muted` / `--secondary` / `--accent`; alternating section bands, hover fills.
- **Hairline** (#e4e4e7): `--border` / `--input`.
- **Destructive** (#e7000b): mostly as a 10% wash with full-strength text.

### Named Rules
**The Grey Band Rule.** On `bg-muted`, teal text is brand-700, never `text-primary`. Teal icons may stay brand-600 (non-text, 3:1).
**The One Voice Rule.** Teal is spent on actions, ticks and links. Status meaning uses the tone set (neutral, brand, iris, green, amber, rose, slate), each as 50 wash / 200 border / 700-800 text.

## Typography

**Font:** Geist (sans) for everything; Geist Mono for step numbers and code. Headings use `font-heading`, which equals the sans face on the platform and the store's face on storefronts.

**Character:** One neutral grotesque, semibold with tight tracking for headings, relaxed leading for prose.

### Hierarchy
- **Display** (600, 2rem to 3rem at `sm`, 1.1, tracking-tight, `max-w-[22ch]`, `text-balance`): the hero h1 only.
- **Headline** (600, 1.5rem to 1.875rem at `sm`, tracking-tight, balanced): section h2 via `SectionHeading`, capped at `max-w-2xl`.
- **Title** (600, 0.875rem): card and step h3s.
- **Body** (400, 1rem to 1.125rem, 1.625, `max-w-[52ch]`): hero and section leads.
- **Body Small** (400, 0.875rem, 1.625): card copy, check lists, feature body on mobile.
- **Label Mono** (600, 0.75rem, Geist Mono): numbered steps ("01", "02").

## Layout

Marketing pages are stacked full-bleed `Section` bands (`src/app/[locale]/kit.tsx`). The band owns padding and tint; the inner column owns the measure: `max-w-6xl` (wide) or `max-w-4xl` (prose), `px-4 sm:px-6`, `py-14 sm:py-20`. `tone="muted"` adds `bg-muted` plus `border-y` hairlines; plain and muted alternate and two muted bands never touch. Feature rows are two-column at `lg` with `gap-10 lg:gap-14`, alternating image side. Card grids use `gap-4` at 3, 4 or 5 columns. The workspace reads at a 14px base.

## Elevation & Depth

Flat by default. Cards and image frames get a 1px `ring-foreground/10`, not a shadow. Depth is tonal (white on the zinc band).

### Shadow Vocabulary
- **sm** (`0 1px 2px 0 oklch(0.141 0.005 285.823 / 0.06)`): small controls.
- **md** (`0 2px 4px -2px … / 0.06, 0 8px 20px -6px … / 0.1`): popovers, dropdowns.
- **lg** (`0 4px 8px -4px … / 0.08, 0 16px 40px -12px … / 0.14`): submenus, dialogs.

**The Overlay-Only Shadow Rule.** A shadow means "this floats above the page". Resting surfaces never carry one.

## Shapes

One radius root (`--radius: 8px`) with derived steps. Controls, inputs and popovers are `rounded-lg` (8px); cards, image frames and CTA panels are `rounded-xl` (11.2px); badges are pill-shaped. Product and marketing imagery sits in a 1:1 frame.

## Components

### Buttons
- **Primary:** teal fill, white text, `rounded-lg`, 14px medium; `h-8` default, `h-9 px-4` on marketing. Hover drops to 80% opacity.
- **Outline:** white with hairline border, hover `bg-muted`. The secondary action beside a primary.
- **Focus:** border to `--ring` plus a 3px `ring-ring/50`. Active nudges down 1px.

### Cards
White, `rounded-xl`, `ring-1 ring-foreground/10`, 16px internal spacing (12px at `size="sm"`). `StepCard` puts a mono step number over a title and small muted body.

### Inputs
`h-8`, `rounded-lg`, hairline border, transparent fill; focus matches buttons; invalid uses a destructive border and 20% ring.

### Badges / Tones
Pill, `h-5`, 12px medium. Workspace tones use the 50 / 200 / 700-800 triplet per hue.

### Marketing kit
- **SectionHeading:** h2 plus one optional muted lead (`mt-3`).
- **CheckList:** small muted lines with a teal `CheckIcon` tick, the one place teal touches body copy.
- **CTA panel:** `bg-primary/5` with `ring-primary/20`, centered, `rounded-xl`.

## Do's and Don'ts

### Do:
- **Do** compose marketing pages from `Section` / `SectionHeading` / `CheckList`, alternating plain and muted bands.
- **Do** use `text-muted-foreground` (#5f5f68) for secondary copy on either white or the zinc band.
- **Do** switch teal text to `text-brand-700` inside `bg-muted` sections and on brand washes.
- **Do** use Lucide icons at `size-4` / `size-5`, teal or muted.

### Don't:
- **Don't** use brand-500 or lighter for text; they fail 4.5:1 on white.
- **Don't** put shadows on cards or sections; use the hairline ring.
- **Don't** add dark-mode styling; the theme is light only.
- **Don't** place two `tone="muted"` sections next to each other.
