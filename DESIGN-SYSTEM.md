# Minds of the Future — Design System

Purpose: the single source of truth for visual design across the platform. Every component, page, and UI decision derives from this file. Do not introduce colors, fonts, or spacing values outside what's defined here.

Reference direction: dark, technical, professional — closer to Deductive AI / Together AI / Arthur than generic SaaS dark-mode. Icon and geometry-led, not illustration-led. Restrained motion, not decorative animation. Legible and credible enough for a university Dean or VC to trust in three seconds, distinctive enough to not read as a template.

## 1. Color tokens

Primary palette (blue — default)

```
--bg-primary:      #0A0E1A   /* near-black, cool undertone */
--bg-surface:       #12172A   /* cards, panels */
--bg-surface-hover: #1A2138
--border:           #232B45
--accent-primary:   #3B82F6   /* electric blue — CTAs, links, active states */
--accent-secondary: #00D9FF   /* cyan — highlights, glow accents, data viz */
--text-primary:     #F5F7FA
--text-muted:       #8A93A8
--text-disabled:    #4A5268
--success:          #10B981
--warning:          #F59E0B
--danger:           #EF4444
```

Alternate palette (red — for a bolder secondary treatment, e.g. urgent CTAs or a distinct sub-brand moment)

```
--accent-primary-alt:   #E63946
--accent-secondary-alt: #FF6B5B
```

Use sparingly and only where explicitly called for — not a wholesale swap of the primary palette.

Rules:

- Backgrounds are always near-black, never pure `#000000` (too harsh, no depth).
- Only ever one accent color active per view as the dominant color; the secondary accent is for small highlight moments (a glow, an active indicator), not competing for attention.
- Never use pure white text (`#FFFFFF`) — use `--text-primary` for less eye strain on dark backgrounds.

**Implementation note:** the codebase's CSS variables (`app/globals.css`) store these as HSL triples (`H S% L%`) to match the existing shadcn `hsl(var(--x))` convention Tailwind config reads from — the same colors, just converted for that pipeline. `--danger` on a solid button fill uses dark text (`--bg-primary`), not `--text-primary`, because light text on `#EF4444` measures ~3.5:1 (fails WCAG AA's 4.5:1) — the same contrast failure this codebase already fixed once before on shadcn's near-identical stock red. Text/borders/icons in `--danger` on the dark background are fine (~5.1:1).

## 2. Typography

- Display face: Space Grotesk (headlines, hero text) — technical, geometric, distinctive without being a gimmick.
- Body face: Inter (everything else — UI copy, paragraphs, forms).
- Mono/utility face: JetBrains Mono (data, timestamps, code snippets, technical labels — reinforces the "built by builders" register).

Scale:

```
--text-hero:  clamp(2.5rem, 5vw, 4.5rem)  / Space Grotesk / 600
--text-h1:    2rem      / Space Grotesk / 600
--text-h2:    1.5rem    / Space Grotesk / 600
--text-h3:    1.25rem   / Space Grotesk / 500
--text-body:  1rem      / Inter / 400
--text-small: 0.875rem  / Inter / 400
--text-mono:  0.875rem  / JetBrains Mono / 400
```

Letter-spacing: slightly widened (0.02em) on eyebrows/labels and uppercase text only. Never widen body copy.

## 3. Layout

- Base spacing unit: 4px. All spacing in multiples of 4 (8, 12, 16, 24, 32, 48, 64, 96).
- Max content width: 1200px, generous side padding (min 24px mobile, 64px+ desktop).
- Cards/panels: subtle border (`--border`) over background-color contrast alone — avoid heavy shadows, they read as generic SaaS.
- Grid-based, not centered-stack-everything — technical audiences respond to structure.

## 4. Signature element

The build-timeline motif. Borrowed directly from the platform's own core feature (check-ins + commits + milestones as a chronological thread) — the same visual language used for a team's process signal in the judge dashboard becomes the site's own visual signature: a vertical or horizontal connected-node timeline, rendered in the accent color, used sparingly as the one memorable device (e.g. in the hero, or to represent the Scout → Build → Judge → Network flywheel). This ties brand and product together rather than being decoration.

## 5. Motion

- Page load: one orchestrated reveal (fade + slight upward translate on hero elements, staggered ~80ms), not scattered.
- Scroll: subtle reveal-on-scroll for section entries, no parallax gimmicks.
- Hover: micro-interactions only — border glow using `--accent-secondary` at low opacity, no heavy transforms.
- Respect `prefers-reduced-motion` — disable all non-essential motion when set.

## 6. Component patterns

- Buttons: solid accent-primary fill for primary actions, outlined/ghost for secondary, never more than one solid-fill CTA visible per view.
- Cards: `--bg-surface` background, `--border` outline, no drop shadow — depth comes from the border and subtle background-color shift, not shadow.
- Icons: geometric, single-weight line icons (not filled/glyph-style) — Lucide icon set fits this register well.
- Data/numbers: rendered in the mono face, always — reinforces technical credibility wherever a stat, count, or metric appears.

## 7. Voice in UI copy

Per the platform's own principles: active voice, plain verbs, no filler. A participant manages their submission, not a "workflow." Errors state what happened and how to fix it, never apologize. Empty states are an invitation to act, not a dead end.

## Claude Code usage

Read this file before writing any component. Every color, font, and spacing value must come from the tokens defined here — do not introduce ad-hoc values. Use the build-timeline motif as the signature visual element wherever the brand needs to show up distinctively (hero sections, marketing pages) rather than defaulting to generic gradient/icon-grid treatments.
