# UI / UX Visual Polish – AIAdvocate

This document defines **P2-level visual polish rules** for the AIAdvocate client (Expo Router, React Native Paper Material 3 theme). Use it *after* P0/P1 issues from `docs/ui-ux-pass.md` are resolved or explicitly logged.

- P0 / P1 rules in `docs/ui-ux-pass.md` are **higher priority** than anything here.
- Never break accessibility, platform conventions, or performance to achieve cosmetic effects.

Primary surfaces:

- `mobile-app/app/**` – Expo Router screens/layouts (tabs, stacks, modals).
- `mobile-app/components/**` – shared components (cards, lists, chips, forms, modals, filters).
- `mobile-app/constants/paper-theme.ts` – central Material 3 theme (color, typography, shapes).
- Any other shared UI tokens/utilities referenced by the above.

---

## 0. Constraints (Do not break these)

Beautification must **never**:

- Reduce text or UI element contrast below WCAG 2.2 AA.
- Shrink hit targets below minimums in the main UI spec.
- Weaken or remove focus indicators.
- Ignore `prefers-reduced-motion`.
- Break safe-area handling, causing content to clash with notches, status bars, or home indicators. :contentReference[oaicite:0]{index=0}
- Bypass React Native Paper / Material 3 theming for ad-hoc styles. :contentReference[oaicite:1]{index=1}

Polish changes should be:

- Implemented via design **tokens** and **shared components** where possible.
- Cohesive (per screen or component), not scattered one-off tweaks.

---

## 1. Theming and Brand Feel (Paper + Material 3)

AIAdvocate uses a Material 3 theme via React Native Paper, which exposes three key subsystems: **color**, **typography**, and **shape**. :contentReference[oaicite:2]{index=2}

### 1.1 Theme structure

In `mobile-app/constants/paper-theme.ts`:

- Ensure the theme defines:
  - **Color scheme** (primary, secondary, tertiary, error, surface, background, outline, etc.).
  - **Typography** tokens that map to the app’s type scale (display, headline, title, body, label).
  - **Shapes** (small/medium/large radii) used consistently across components.

When polishing visuals:

- Prefer updating the **theme** instead of individual components.
- Use React Native Paper’s theming API so changes cascade to all components. :contentReference[oaicite:3]{index=3}

### 1.2 Color and semantic roles (brand-specific)

Goals:

- Keep the app on-brand for Love Never Fails (survivor-focused, serious but hopeful).
- Avoid “rainbow UI”; use a restrained palette consistent with Material 3 color roles. :contentReference[oaicite:4]{index=4}

Rules:

- Define and use a **single primary brand color** (e.g., for CTAs, selected states, main chips).
- Keep a **secondary accent** for complementary emphasis.
- Define clear **error**, **warning**, **success**, and **info** colors mapped to the M3 scheme (error, secondary, tertiary, etc.).
- Use at most 1–2 additional accent colors (e.g., for vote outcomes or party hints) and keep them in tokens, not inline.
- Neutral palette:
  - Use 5–7 neutral steps (e.g., `neutral-50` … `neutral-900`) for backgrounds, surfaces, borders, and text.

Do not:

- Introduce ad-hoc hex codes in component files.
- Use color alone to convey meaning; pair it with icons or labels.

### 1.3 Light and dark themes

If the app supports dark mode:

- Keep **contrast** compliant in both light and dark themes.
- In dark theme:
  - Prefer **lighter borders** and subtle surface elevation instead of heavy pure-black shadows. :contentReference[oaicite:5]{index=5}
- Make sure bottom tabs, headers, and cards visually separate from the background via elevation or color.

---

## 2. Typography and Visual Hierarchy (Mobile-first)

Polish here is about *consistency* and *tone*, not changing the core type scale.

### 2.1 Typography tokens

- Align `paper-theme.ts` typography with Material 3 styles:
  - Display / headline for screen titles.
  - Title/body for card titles and body text.
  - Label for chips, buttons, and small tags. :contentReference[oaicite:6]{index=6}
- Ensure:
  - Same style is used for the same role across screens (e.g., bill card titles, legislator names, tab labels).
  - Line-height keeps text readable in dense card lists.

### 2.2 Tone and usage

- Use larger display/headline type sparingly (on primary screens like:
  - Active Bills home.
  - Legislator profile.
  - Love Never Fails hub).
- For complex content (bill summaries, vote history):
  - Favor **body** and **title** styles for legibility.
- Avoid:
  - Mixing too many font weights on one screen.
  - All-caps for anything longer than short labels.

---

## 3. Layout, Spacing, and Density (Expo + Safe Areas)

### 3.1 Spacing scale

- Base unit: **8 px** for mobile is recommended; everything else is a multiple of 4 or 8. :contentReference[oaicite:7]{index=7}
- Apply consistently to:
  - Card padding.
  - Gaps between controls.
  - Margins around sections and lists.

Guidelines:

- Cards:
  - 16–20 px inner padding.
  - 12–16 px between card header/body/footer sections.
- Lists:
  - 8–12 px vertical gap between cards.
- Sections:
  - 16–24 px between major sections (e.g., “Bill summary”, “Vote history”, “Outreach”).

### 3.2 Density modes

Define two densities:

- **Comfortable (default)**:
  - For most screens: bill list, bill detail, legislator profile, hub, settings.
  - More padding, breathing room, and clearer group separation.
- **Compact (opt-in)**:
  - For heavy data views: vote history timelines, long filters, administrative lists.
  - Slightly reduced vertical spacing, but:
    - Never shrink tap targets.
    - Keep text sizes from the base checklist.

### 3.3 Safe areas, tabs, and bottom ergonomics

- Ensure all screens use `SafeAreaProvider` and `SafeAreaView` (or equivalent) so content is not obscured by notches, status bars, or home indicators. :contentReference[oaicite:8]{index=8}
- For bottom tab navigation:
  - Maintain a comfortable tab bar height.
  - Use icons + short labels.
  - Ensure active/inactive states are visually distinct but accessible. :contentReference[oaicite:9]{index=9}
- Primary CTAs (e.g., “Write your rep”, “Call office”) should be:
  - Within natural thumb reach on larger phones.
  - Not crammed tight against OS gestures at the bottom edge.

---

## 4. Components and Surfaces (Cards, Lists, Modals)

### 4.1 Shape language (radii and borders)

Material 3 emphasizes **soft shapes** with consistent corner radii to create approachable surfaces. :contentReference[oaicite:10]{index=10}

Define three radii in the theme:

- `shape.small`: ~4 px – chips, tags, small controls.
- `shape.medium`: ~8 px – buttons, inputs.
- `shape.large`: 12–16 px – cards, modals, bottom sheets.

Rules:

- Cards and modals should use `shape.large` consistently.
- Buttons and text fields should use `shape.medium`.
- Chips and small tokens use `shape.small`.

No arbitrary radii (6 px / 10 px etc.) in isolated components.

### 4.2 Cards and lists (bill and legislator content)

Polish goals:

- Cards should feel like **cohesive, tappable objects**.
- Repeated lists (bill feeds, vote history rows) should scan easily.

Guidelines:

- Card structure:
  - Header: title, high-level labels (session, status, chamber).
  - Body: summary snippet or key stats.
  - Footer: secondary info (e.g., last updated, call-to-action).
- Use elevation or subtle borders (per theme) for card separation, not heavy outlines.
- List rhythm:
  - Maintain consistent leading/trailing padding.
  - Align iconography (e.g., vote icons) to a vertical grid line.

### 4.3 Modals, bottom sheets, and drawers

- Use consistent entrance/exit animations (see Motion section).
- Ensure:
  - Rounded top corners for bottom sheets; full-bleed width inside safe area.
  - Dimmed but visible background for context.
- Keep a clear hierarchy:
  - Screen background < card < modal/bottom sheet in elevation.

---

## 5. Motion and Microinteractions

Material 3 advocates **meaningful motion**: short, smooth transitions that reinforce hierarchy. :contentReference[oaicite:11]{index=11}

### 5.1 Durations and easing

Use consistent motion tokens:

- Micro-feedback (button press, chip toggle): **100–150 ms**.
- Component/state transitions (tabs, accordions, filters): **150–220 ms**.
- Screen-level transitions (modals, navigation transitions): **200–300 ms**.

Use easing functions that:

- Ease out on entry (slightly snappy).
- Ease in on exit.
- Avoid linear for major transitions.

### 5.2 Where to animate

Good candidates:

- Button press:
  - Slight scale or opacity change.
- Tab switches:
  - Underline/indicator sliding between tabs.
- Card focus/hover (web only):
  - Subtle elevation or shadow change.
- Toasts:
  - Slide/fade in/out.

Avoid:

- Infinite looping animations in primary content.
- Large, distracting parallax for serious content like survivor legislation.

### 5.3 Reduced motion

Always respect `prefers-reduced-motion`:

- Disable or minimize non-essential animations when this setting is on.
- Keep core feedback (e.g., instant state changes, toasts) but without big transitions.

---

## 6. Iconography and Illustration

React Native Paper + Material Design expect **simple, consistent iconography**. :contentReference[oaicite:12]{index=12}

### 6.1 Icon set and usage

- Use one icon family with a single stroke style (outline vs filled).
- Sizes:
  - 20–24 px for most navigation and action icons.
- Keep consistent:
  - Stroke width.
  - Padding within icon container.
- Use icons for:
  - Navigation tabs.
  - Status (e.g., vote outcome, bookmarked).
  - Actions (share, call, email, directions).

Do not:

- Mix arbitrary icon packs with different visual styles.
- Use icons as decoration without clear meaning.

### 6.2 Illustrations and brand moments

Modern mobile apps often use **bespoke illustrations and custom iconography** to reinforce brand and story when used sparingly. :contentReference[oaicite:13]{index=13}

For AIAdvocate:

- Reserve illustrations for:
  - Empty states (no bills, no saved items).
  - Onboarding moments.
  - Love Never Fails hub storytelling sections.
- Style:
  - Flat/minimalist shapes.
  - Palette pulled from the brand theme, not arbitrary colors.
- Keep illustrations secondary:
  - They should not overpower the call-to-action.

---

## 7. Empty, Loading, and Error States (Polish Layer)

These already exist conceptually in the base spec; polish here standardizes the *look*.

### 7.1 Empty states

- Use a consistent pattern:
  - Icon/illustration on top.
  - Short title.
  - One sentence explaining what is going on.
  - CTA button or link where appropriate.
- Use the same spacing, typography, and illustration style across all empty states.

### 7.2 Loading states

- Prefer skeletons or lightweight shimmer for:
  - Bill feeds.
  - Legislator profiles.
  - Vote history lists.
- Use spinners only where skeletons do not make sense (e.g., small modal actions).

### 7.3 Error states

- Use consistent error surfaces:
  - Icon + title + message + action (retry / back / contact support).
- For inline errors (e.g., form fields):
  - Align them visually (same color, icon, text style).

---

## 8. Process: How to Apply Visual Polish

When asked to “beautify” or apply “visual polish”:

1. **Confirm P0/P1**  
   - Verify that P0 (accessibility, broken flows) and P1 (core usability) issues are fixed or logged for the target surface.

2. **Identify scope**  
   - Screen(s) and shared components impacted.
   - Relevant tokens in `paper-theme.ts`.

3. **Refine tokens first**  
   - Adjust colors, typography mappings, shapes, elevation, motion durations at the theme level where possible.

4. **Update components**  
   - Refine card layouts, spacing, icon usage, motion for shared components in `mobile-app/components/**`.

5. **Finalize per-screen tweaks**  
   - Apply layout/density changes in specific screens.
   - Ensure safe-area handling, thumb ergonomics, and tab/nav consistency.

6. **Verify**  
   - Test light/dark theme if enabled.
   - Test at least two device sizes (small phone, large phone, plus web).
   - Check `prefers-reduced-motion` behavior on at least one platform.

---

## 9. Sanity Check

- **Higher-order rule**: If a proposed visual change conflicts with:
  - WCAG 2.2 AA,
  - Material 3 core principles,
  - React Native Paper / Expo platform conventions,
  
  then **do not make** that change.

- All P2 polish should make the interface:
  - More consistent.
  - Easier to scan.
  - More on-brand.
  - Equally or more accessible than before.
