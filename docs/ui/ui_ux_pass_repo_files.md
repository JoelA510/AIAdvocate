# Repo Files for UI/UX Pass Setup

Below are the files to add to your repo.

- `docs/ui-ux-pass.md` – canonical full checklist.
- `docs/ui-ux-pass-summary.md` – P0/P1 quick version.
- `docs/ui-ux-rules.json` – optional structured rules.
- `docs/agent-gemini-ui-ux.md` – workspace instructions for Gemini 3 in Antigravity.
- `docs/agent-codex-ui-ux.md` – project instructions for Codex-GPT5.1-Pro.

---

## File: docs/ui-ux-pass.md

```markdown
# UI / UX Pass Checklist (Canonical)

## 0. Purpose and Scope

When you are asked to "do a full UI/UX pass", follow this checklist.

Goals:

- Make the product usable, consistent, and modern across web and mobile.
- Meet or exceed WCAG 2.2 AA accessibility.
- Align with platform conventions (Material Design for web/Android, Apple HIG for iOS).
- Enforce a single design language through tokens and shared components.

Applies to:

- All UI code (React/TS, styling, components, layouts, forms, tables, navigation).
- All major flows (authentication, core CRUD flows, search, settings, error handling).

---

## 1. Heuristic and Standards Layer

Use these as the lens for all checks.

### 1.1 Usability Heuristics

For each screen and flow, check:

1) **Visibility of system status**
- Show progress for long operations.
- Display success/failure clearly.

2) **Match with real-world language**
- Use domain terms users already know.
- Avoid internal jargon, codes, or implementation names.

3) **User control and freedom**
- Provide cancel/undo for destructive or long actions when feasible.
- Allow users to back out of flows without losing all progress.

4) **Consistency and standards**
- Same pattern, label, and icon mean the same thing everywhere.
- Use standard icons and patterns where users expect them.

5) **Error prevention**
- Use safe defaults.
- Confirm destructive actions.
- Validate early where it helps.

6) **Recognition vs recall**
- Prefer visible options over requiring memorization.
- Use previews, history, and autofill where appropriate.

7) **Flexibility and efficiency**
- Provide shortcuts or batch actions for expert users.
- Avoid forcing repetitive manual steps.

8) **Aesthetic and minimalist design**
- Remove redundant text and decoration that does not help.
- Keep screens focused on primary tasks.

9) **Error diagnosis and recovery**
- Errors clearly state what went wrong and what to do.
- Group related errors and provide a summary for long forms.

10) **Help and documentation**
- Inline help where needed, not massive walls of text.
- Link to deeper docs for complex concepts.

### 1.2 WCAG 2.2 AA Key Points

Ensure at least:

- **Contrast**: Text and essential UI elements meet contrast ratios.
- **Focus not obscured**: The focused element’s indicator is visible and not covered.
- **Target size minimum**: Pointer targets are at least 24x24 CSS px, with spacing exceptions allowed.
- **Consistent help**: Help is available and placed consistently where needed.
- **Redundant entry**: Do not force users to re-enter data you already have.
- **Accessible authentication**: Authentication does not rely only on puzzles or remembering complex strings; copy/paste and password managers work.

Internal product bar: prefer 44x44 CSS px or larger for primary interactive targets.

---

## 2. Layout, Spacing, and Responsive Behavior

### 2.1 Grid and Spacing

- Use a spacing scale (4 px or 8 px increments).
- Align content to a grid (columns, gutters, margins).
- Content line length:
  - Aim for 45–75 characters per line for body text on desktop.
- Outer margins:
  - Mobile: 16–24 px.
  - Desktop: 24–40 px.
- Vertical rhythm:
  - Tight spacing inside a group (e.g. 8–12 px).
  - Larger spacing between groups (e.g. 24–32 px).

Success criteria:

- Most gaps fall on the spacing scale.
- Related elements look grouped; unrelated groups are clearly separated.

### 2.2 Hit Targets and Touch Comfort

- Product bar: pointer targets at least 44 x 44 CSS px.
- WCAG minimum: 24 x 24 CSS px for targets, or spacing such that a 24 px circle around each target does not intersect.
- Space between separate controls: aim for at least 8 px.
- For small icons, use larger invisible hit areas via padding.

### 2.3 Responsive Behavior and Breakpoints

Define breakpoints (example; adjust to system):

- Mobile: < 600 px width.
- Tablet: 600–1024 px.
- Desktop: > 1024 px.

For each breakpoint:

- Navigation remains discoverable and usable.
- Primary CTAs are visible without excessive scrolling.
- Main content does not require horizontal scrolling.

Layout patterns:

- Multi-column layouts collapse to a single column in logical reading order.
- Sidebars become drawers, accordions, or top/bottom sections; no critical info is hidden by default.

---

## 3. Typography and Hierarchy

### 3.1 Type Scale and Roles

Define a type scale with roles (similar to Material 3):

- Display
- Headline
- Title
- Body
- Label

Typical starting values:

- Display / page title: 28–32 px, bold, line-height ~1.2.
- Section heading: 20–24 px.
- Body text: 16 px with 1.4–1.6 line-height.
- Small text: 12–14 px, used sparingly with high contrast.

Rules:

- Text uses only defined styles; no random sizes like 15 px or 17 px.
- Heading levels are visually consistent across the app.
- Handle wrapping gracefully; avoid truncation of critical content.

### 3.2 Visual Hierarchy and Scanability

For each screen:

- At a glance you can tell:
  - Main task.
  - Primary action.
- Differentiate primary vs secondary elements via size, weight, color, and position.
- Group related content with headings and whitespace.
- Avoid ALL CAPS body text; reserve it for small labels or tags only.

---

## 4. Color, Contrast, and Theming

### 4.1 Contrast

- Text vs background:
  - Normal text: at least 4.5:1 contrast.
  - Large text: at least 3:1.
- Non-text UI elements (icons, borders, focus outlines): at least 3:1 vs adjacent colors.
- Disabled states:
  - May be lower contrast, but critical content should never be unreadable.
  - Use non-color cues (labels, icons) for disabled or unavailable actions.

### 4.2 Semantic Color Roles

Define color roles and enforce them:

- Primary, secondary
- Background, surface
- Error, warning, success, info

Rules:

- Primary actions use the primary color.
- Destructive actions use a specific destructive color plus icon/label cues.
- Do not rely on color alone to communicate state; pair color with text or icon.

### 4.3 Light and Dark Themes

If both themes exist:

- All colors must meet contrast requirements in both themes.
- Use 2–3 elevation levels:
  - Page background.
  - Card/surface.
  - Header/app bar.
- Avoid overuse of drop shadows; rely on color and elevation.

---

## 5. Components, States, and Affordances

### 5.1 Component Consistency

For each component type (buttons, inputs, cards, chips, tabs, dropdowns, modals, list rows):

- Consistent border radius, padding, typography, icon placement.
- States covered:
  - Default
  - Hover (web)
  - Focus
  - Active/pressed
  - Disabled
  - Loading (where applicable)
  - Error (where applicable)

Affordance:

- Interactive components look interactive via color, outline, shadow, icon, or motion.

Buttons:

- Inner padding typically 8–12 px vertical, 12–20 px horizontal.
- Icon + label:
  - Consistent icon size.
  - Consistent spacing between icon and text.

Inputs:

- Strong focus ring that clearly encloses the input.
- Error states use color, icon, and message text.
- Disabled inputs read as disabled but still legible if content matters.

Lists and tables:

- Hover and active states on desktop.
- Clickable rows:
  - Pointer cursor.
  - Visual feedback on hover/press/focus.

### 5.2 Feedback and System Status

For every user action, provide feedback:

- Immediate:
  - Button press feedback.
  - Control toggles change state instantly.

- Loading:
  - Use skeletons, spinners, or progress indicators for operations > ~500 ms.

- Completion:
  - Show toast, inline confirmation, or clear visual change.

- Failure:
  - Show clear, actionable errors.
  - Avoid silent failures.

---

## 6. Navigation and Information Architecture

### 6.1 Global Navigation

- Users always know:
  - Where they are.
  - Where they can go.
- Active nav item is clearly highlighted.
- Navigation layout is consistent across screens.

Mobile:

- Use bottom nav or a clear drawer/hamburger when appropriate.
- Do not hide primary navigation behind obscure gestures.

### 6.2 Local Navigation and Hierarchy

- Use breadcrumbs for depth beyond two levels.
- Tabs:
  - Short, scannable labels.
  - Avoid horizontal tab overflows where many tabs require scrolling; prefer grouping.
- Back behavior:
  - Browser/OS back acts predictably.
  - Do not reset unrelated state unexpectedly when going back.

### 6.3 Platform Conventions

- Web:
  - Links navigate; buttons perform actions.
  - Respect native browser behaviors.

- Mobile (iOS/Android):
  - Follow platform navigation patterns (tab bars, navigation bars, modal sheets).
  - Do not redefine common icons.

---

## 7. Forms and Data Entry

### 7.1 Structure and Grouping

- Group related fields with headings and whitespace.
- Order fields to match the user’s mental model.
- Multi-step forms:
  - Use visible step indicators.
  - Allow moving back without losing data.

### 7.2 Labels, Help Text, and Validation

- Labels:
  - Always visible, not just placeholders.

- Help text:
  - Short, placed beneath the field.

- Validation:
  - Use inline validation where useful.
  - Avoid overly noisy validation that fires on every keystroke.

- Error messages:
  - Specific and actionable.
  - For long forms, show a summary at the top and focus the first invalid field.

### 7.3 Input Optimization

- Mobile keyboards:
  - Use appropriate input types for email, phone, numeric fields.

- Defaults:
  - Provide safe, smart defaults when possible.

- Auto-save:
  - Prefer auto-saving drafts or keeping input when navigating away.

- Redundant entry:
  - Do not ask users to re-enter data that the system already knows.

---

## 8. Tables and Dense Data

If the product includes tables or grids:

- Structure:
  - Use semantic table markup for real tabular data.
  - Provide sticky headers for long tables.

- Alignment:
  - Numbers right-aligned.
  - Text left-aligned.

- Interaction:
  - Sortable columns show a sort icon and direction.
  - Filters are clearly associated with the table and show result counts.

- Selection:
  - Clickable rows show pointer cursor and visual feedback.
  - Keyboard focus moves predictably through rows and cells.

- Responsiveness:
  - On small screens, either:
    - Enable horizontal scroll with a clear indicator; or
    - Use card-style rows summarizing key columns with a "details" view.

- Accessibility:
  - Use appropriate ARIA attributes and announce sort changes and pagination.

---

## 9. Accessibility

### 9.1 Semantic Structure

- Use `h1–h6` headings in logical order.
- Use semantic elements (`header`, `nav`, `main`, `footer`, `aside`).
- Buttons are `<button>`, links are `<a>`.

### 9.2 Keyboard and Focus

- All interactive elements are reachable and operable via keyboard.
- Visible focus:
  - Strong focus outline or indicator with clear contrast.
  - Indicator encloses or is strongly associated with the focused element.
- Focus order:
  - Follows a logical visual and reading order.
- Modals:
  - Trap focus while open.
  - Esc closes modal.
  - Focus returns to triggering element on close.

### 9.3 Screen Readers and ARIA

- Controls have accessible names (labels or `aria-label`).
- Informational images have descriptive `alt` text.
- Decorative images use `alt=""`.
- Use ARIA live regions for important async updates where needed.

### 9.4 Pointer and Gesture Alternatives

- Provide non-drag alternatives for drag-and-drop.
- Avoid gesture-only actions that lack visible controls.

---

## 10. Motion and Reduced Motion

- Use animations for feedback and transitions, typically 150–300 ms.
- Respect `prefers-reduced-motion` and disable or minimize non-essential animations.
- Avoid excessive parallax and flashy effects.

---

## 11. Content, Localization, and States

### 11.1 Microcopy

- Use clear, direct language.
- Button labels are verb-first and specific.
- Avoid internal jargon or unexplained acronyms.

### 11.2 Localization and Long Content

- Test layouts with:
  - Long labels (2–3x normal length).
  - Pseudo-localized strings.

- Ensure:
  - No overlapping or clipped text.
  - Buttons and controls expand or wrap gracefully.

### 11.3 Empty, Loading, and Error States

- Empty states:
  - Explain why the state is empty and provide a next step.

- Loading:
  - Use skeletons or spinners that approximate the final layout.

- Errors:
  - Distinguish between validation, network, permission, and server errors.
  - Provide retry and guidance for network or server issues.

---

## 12. Performance and Perceived Speed

- Show something useful quickly (skeletons, minimal layout).
- Avoid layout shifts by reserving space for images and async content.
- For long-running tasks:
  - Show progress.
  - Allow background completion where possible.

---

## 13. Design System and Governance

- Tokens:
  - Colors, type scale, spacing, border radius, shadows, motion durations.

- Components:
  - Document components, variants, and states with examples.

- Usage guidelines:
  - Explain when to use each component.
  - Document anti-patterns to avoid.

- Governance:
  - New UI should use existing tokens and components where possible.
  - Prefer token/component updates over one-off overrides.

---

## 14. How to Run a UI/UX Pass

1) Select 3–5 primary flows (e.g. login, search, core create/edit, error recovery).
2) For each flow:
   - Walk through and log issues using this checklist and the heuristics.
3) For each unique screen:
   - Check layout, responsiveness, typography, color, components, navigation, forms, tables, and states.
4) Run an accessibility sweep:
   - Keyboard-only run.
   - Screen reader smoke test on key screens.
   - Contrast and target-size spot-check.
5) Run edge-content tests:
   - Long labels, dense data, pseudo-localized text.
6) Group findings into tickets:
   - P0: blockers and accessibility failures.
   - P1: important usability and consistency issues.
   - P2: visual polish and minor issues.

This document is the source of truth for UI/UX passes.
```

---

## File: docs/ui-ux-pass-summary.md

```markdown
# UI / UX Pass Summary (P0/P1 Focus)

Use this when you need a quick version of the full checklist.

## P0 – Must Fix

- **Accessibility blockers**
  - Text contrast < 4.5:1 (normal) or < 3:1 (large).
  - Interactive elements not keyboard accessible.
  - Missing or invisible focus indicators.
  - Critical actions with click area < 24x24 px and no spacing.
  - Drag-and-drop without an alternative.
  - Forms where labels are missing or only placeholders.

- **Broken flows**
  - Users cannot complete a core task due to UI issues.
  - Navigation dead ends or loops.
  - Modals that trap focus or cannot be closed.

- **Unreadable or confusing content**
  - Body text < 14–16 px without strong reason.
  - Key content clipped, overlapping, or hidden.

## P1 – Strongly Recommended

- **Layout & spacing**
  - Apply 4/8 px spacing scale.
  - Ensure margins and grouping are consistent.

- **Typography & hierarchy**
  - Use defined type styles (display, heading, body, label).
  - Ensure each screen has a clear primary action at a glance.

- **Components & states**
  - Buttons, inputs, lists, modals have consistent radii, padding, and states.
  - Loading, success, and error feedback present for all async actions.

- **Navigation**
  - Active section clearly highlighted.
  - Back navigation works predictably.

- **Forms**
  - Group related fields; use inline, specific error messages.
  - Avoid redundant data entry; use sensible defaults.

- **Tables & dense data**
  - Use semantic tables.
  - Sticky headers or other patterns to preserve context.
  - Clear sort/filter behavior.

## Process

1) Run through 3–5 core flows.
2) Fix all P0 issues.
3) Fix as many P1 issues as possible.
4) Log P2 items (visual polish) as follow-up tasks.
```

---

## File: docs/ui-ux-rules.json

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "layout_spacing_scale",
      "priority": "P1",
      "area": "layout",
      "description": "Use a 4 px or 8 px spacing scale for margins, padding, and gaps."
    },
    {
      "id": "layout_line_length",
      "priority": "P1",
      "area": "layout",
      "description": "Body text line length should be approximately 45–75 characters on desktop."
    },
    {
      "id": "target_size_minimum",
      "priority": "P0",
      "area": "interaction",
      "description": "Pointer targets must be at least 24x24 CSS pixels, with a product preference of 44x44 or larger."
    },
    {
      "id": "contrast_text_normal",
      "priority": "P0",
      "area": "color",
      "description": "Normal text must have at least 4.5:1 contrast against its background."
    },
    {
      "id": "contrast_text_large",
      "priority": "P0",
      "area": "color",
      "description": "Large text must have at least 3:1 contrast against its background."
    },
    {
      "id": "focus_visible",
      "priority": "P0",
      "area": "accessibility",
      "description": "All interactive elements must have a clearly visible focus indicator with good contrast."
    },
    {
      "id": "keyboard_accessible",
      "priority": "P0",
      "area": "accessibility",
      "description": "All interactive elements must be reachable and operable with keyboard only."
    },
    {
      "id": "forms_labels_visible",
      "priority": "P0",
      "area": "forms",
      "description": "Form fields must have always-visible labels and not rely solely on placeholders."
    },
    {
      "id": "forms_error_specific",
      "priority": "P1",
      "area": "forms",
      "description": "Validation error messages must state what is wrong and how to fix it."
    },
    {
      "id": "tables_semantic",
      "priority": "P1",
      "area": "tables",
      "description": "Use semantic table markup for tabular data, with headers and scopes defined."
    },
    {
      "id": "motion_reduced",
      "priority": "P1",
      "area": "motion",
      "description": "Respect the prefers-reduced-motion setting and disable or minimize non-essential animations when it is enabled."
    },
    {
      "id": "feedback_loading",
      "priority": "P1",
      "area": "feedback",
      "description": "Async operations longer than about 500 ms must show a loading state (spinner, skeleton, or progress)."
    },
    {
      "id": "navigation_active_state",
      "priority": "P1",
      "area": "navigation",
      "description": "Global navigation must clearly indicate the current active section."
    }
  ]
}
```

---

## File: docs/agent-gemini-ui-ux.md

```markdown
# Gemini 3 (Antigravity) Workspace Instructions – UI/UX Pass

## Role and Scope

You are a senior product engineer working in the Antigravity AI IDE on this repository.

When the user asks you to perform any "UI/UX pass" or mentions "UI/UX checklist", you must follow `docs/ui-ux-pass.md` as the canonical source of truth.

## Rules

1. **Use the checklist document**
   - Before making UI changes, open `docs/ui-ux-pass.md`.
   - Use it as the primary reference for layout, typography, color/contrast, components, navigation, forms, tables, accessibility, motion, content, and performance.

2. **Flows and components**
   - When asked to run a UI/UX pass on a view or component:
     1. Identify the relevant files (pages, components, styles).
     2. Compare the implementation against the checklist.
     3. List issues grouped by priority (P0, P1, P2).
     4. Propose or apply code changes that fix P0 and P1 issues first.

3. **Accessibility and standards**
   - WCAG 2.2 AA is the minimum bar.
   - Prefer platform conventions: Material Design for web/Android, Apple HIG for iOS.
   - Never remove or weaken focus indicators purely for aesthetic reasons.

4. **Design system alignment**
   - Use existing tokens and shared components where possible.
   - If a change affects multiple screens, prefer updating the underlying component or token instead of duplicating styles.

5. **Change management**
   - When editing code, keep changes cohesive and local to the requested scope.
   - Add or update tests where appropriate (e.g., accessibility tests, snapshot tests, component tests).
   - In explanations, reference rule IDs from `docs/ui-ux-rules.json` when relevant.

## Invocation Examples

The following user requests should trigger a UI/UX pass based on `docs/ui-ux-pass.md`:

- "Run a UI/UX pass on the shipment detail screen."
- "Apply the accessibility part of the UI/UX checklist to all modals."
- "Review the forms in the onboarding flow against our UI/UX guidelines."

For each, explicitly open the relevant files and the checklist, then perform the pass.
```

---

## File: docs/agent-codex-ui-ux.md

```markdown
# Codex-GPT5.1-Pro Project Instructions – UI/UX Pass

## Role and Scope

You are assisting with frontend development for this repository using React, TypeScript, Tailwind CSS, and related tooling.

When the user mentions a "UI/UX pass" or "UI/UX checklist", treat `docs/ui-ux-pass.md` as the canonical design guideline for UI work.

## Frontend Guidance

- Framework: React (+ TypeScript).
- Styling: Tailwind CSS (and any existing component library in this repo).
- Components: Use existing shared components where possible.
- Accessibility: Aim for WCAG 2.2 AA.

## Behavior When Asked for a UI/UX Pass

When a request involves a UI/UX pass:

1. Open `docs/ui-ux-pass.md`.
2. Open the relevant component(s) and page(s).
3. Compare the current implementation with the checklist.
4. Produce a short report that:
   - Lists violations grouped by priority (P0, P1, P2).
   - References rule IDs from `docs/ui-ux-rules.json` where appropriate.
5. Use the provided editing tools (such as apply_patch) to:
   - Fix P0 issues first (accessibility, broken flows).
   - Then fix as many P1 issues as reasonably possible within the requested scope.

## Constraints

- Keep prompts and explanations concise, but follow the checklist rigorously.
- Do not introduce new visual styles or tokens when an equivalent token already exists.
- Do not weaken focus styles, reduce contrast, or shrink hit targets below the checklist requirements.

## Example Usage Prompts

Examples of user prompts you should handle using the UI/UX checklist:

- "Open `docs/ui-ux-pass.md` and run a UI/UX pass on `src/components/ShipmentDetails.tsx`. Fix P0 and P1 issues."
- "Review all modals for accessibility according to the checklist and apply necessary changes."
- "Update the tables in `src/pages/InvoicesPage.tsx` to comply with our UI/UX guidelines."

In each case, start by reading `docs/ui-ux-pass.md`, then apply it to the requested files.
```

