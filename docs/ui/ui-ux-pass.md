```markdown
# UI / UX Pass Checklist (Canonical)

## 0. Purpose and Scope

When you are asked to "do a full UI/UX pass", follow this checklist.

Goals:

- Make the product usable, consistent, and modern across web and mobile (Expo).
- Meet or exceed WCAG 2.2 AA accessibility.
- Align with platform conventions (Material Design via React Native Paper for Android/Web, Apple HIG for iOS).
- Enforce a single design language through React Native Paper tokens and shared components.

Applies to:

- All UI code (React Native/Expo, TypeScript, components, layouts, forms, lists, navigation).
- Primary client is Expo Router (iOS / Android / Web) under `mobile-app/`.
- All major flows (authentication, bill feed, search, settings, error handling).

---

## 1. Heuristic and Standards Layer

Use these as the lens for all checks.

### 1.1 Usability Heuristics

For each screen and flow, check:

1) **Visibility of system status**
- Show progress for long operations (ActivityIndicator).
- Display success/failure clearly (Snackbar/Toast).

2) **Match with real-world language**
- Use domain terms users already know.
- Avoid internal jargon, codes, or implementation names.

3) **User control and freedom**
- Provide cancel/undo for destructive or long actions when feasible.
- Allow users to back out of flows without losing all progress.

4) **Consistency and standards**
- Same pattern, label, and icon mean the same thing everywhere.
- Use standard icons (Material Community Icons) and patterns where users expect them.

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
- **Target size minimum**: Pointer targets are at least 24x24 dp, with spacing exceptions allowed.
- **Consistent help**: Help is available and placed consistently where needed.
- **Redundant entry**: Do not force users to re-enter data you already have.
- **Accessible authentication**: Authentication does not rely only on puzzles or remembering complex strings; copy/paste and password managers work.
- **TTS Prompts**: Ensure important status changes are announced to screen readers.
- **Localization**: Use `i18next` for all user-facing strings to support localization and accessibility preferences.

Internal product bar: prefer 44x44 dp or larger for primary interactive targets.

---

## 2. Layout, Spacing, and Responsive Behavior

### 2.1 Grid and Spacing

- Use a spacing scale (4 dp or 8 dp increments).
- Align content to a grid (columns, gutters, margins).
- Content line length:
  - Aim for 45–75 characters per line for body text on desktop/tablet.
- Outer margins:
  - Mobile: 16–24 dp.
  - Tablet/Desktop: 24–40 dp.
- Safe Area Insets:
  - Respect top/bottom insets (notch, home indicator) via `react-native-safe-area-context`.
  - Ensure content is not obscured by system bars.
- Vertical rhythm:
  - Tight spacing inside a group (e.g. 8–12 dp).
  - Larger spacing between groups (e.g. 24–32 dp).

Success criteria:

- Most gaps fall on the spacing scale.
- Related elements look grouped; unrelated groups are clearly separated.

### 2.2 Hit Targets and Touch Comfort

- Product bar: pointer targets at least 44 x 44 dp.
- WCAG minimum: 24 x 24 dp for targets, or spacing such that a 24 dp circle around each target does not intersect.
- Space between separate controls: aim for at least 8 dp.
- For small icons, use larger invisible hit areas via padding or `IconButton`.

### 2.3 Responsive Behavior and Breakpoints

Define breakpoints (example; adjust to system):

- Mobile: < 600 dp width.
- Tablet: 600–1024 dp.
- Desktop: > 1024 dp.

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

Use React Native Paper's type scale (Material 3):

- Display (Large, Medium, Small)
- Headline (Large, Medium, Small)
- Title (Large, Medium, Small)
- Body (Large, Medium, Small)
- Label (Large, Medium, Small)

Rules:

- Text uses only defined styles from `useTheme()`; no random sizes like 15 dp or 17 dp.
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

Use React Native Paper's color roles:

- Primary, Secondary, Tertiary
- Background, Surface, SurfaceVariant
- Error, Outline

Rules:

- Primary actions use the primary color.
- Destructive actions use `error` colors plus icon/label cues.
- Do not rely on color alone to communicate state; pair color with text or icon.

### 4.3 Light and Dark Themes

If both themes exist:

- All colors must meet contrast requirements in both themes.
- Use elevation levels (Surface 1-5) for depth.
- Avoid overuse of drop shadows; rely on color and elevation.

---

## 5. Components, States, and Affordances

### 5.1 Component Consistency

For each component type (Buttons, TextInputs, Cards, Chips, SegmentedButtons, Modals, List.Item):

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

- Inner padding typically 8–12 dp vertical, 12–20 dp horizontal.
- Icon + label:
  - Consistent icon size.
  - Consistent spacing between icon and text.

Inputs:

- Strong focus ring/underline that clearly indicates focus.
- Error states use color, icon, and message text.
- Disabled inputs read as disabled but still legible if content matters.

Lists and tables:

- Hover and active states on desktop/web.
- Clickable rows:
  - `TouchableRipple` or similar feedback.
  - Visual feedback on press/focus.

### 5.2 Feedback and System Status

For every user action, provide feedback:

- Immediate:
  - Button press feedback (ripple).
  - Control toggles change state instantly.

- Loading:
  - Use skeletons, spinners (`ActivityIndicator`), or progress indicators for operations > ~500 ms.

- Completion:
  - Show toast (`react-native-toast-message`), inline confirmation, or clear visual change.

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

- Use bottom nav (Tabs) for primary sections.
- Use Drawers or Bottom Sheets for secondary actions or filters.
- Do not hide primary navigation behind obscure gestures.

### 6.2 Local Navigation and Hierarchy

- Use breadcrumbs for depth beyond two levels (on Web).
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
  - Short, placed beneath the field (`HelperText`).

- Validation:
  - Use inline validation where useful.
  - Avoid overly noisy validation that fires on every keystroke.

- Error messages:
  - Specific and actionable.
  - For long forms, show a summary at the top and focus the first invalid field.

### 7.3 Input Optimization

- Mobile keyboards:
  - Use appropriate `keyboardType` (email-address, numeric, phone-pad).
  - Use `textContentType` for autofill.

- Defaults:
  - Provide safe, smart defaults when possible.

- Auto-save:
  - Prefer auto-saving drafts or keeping input when navigating away.

- Redundant entry:
  - Do not ask users to re-enter data that the system already knows.

---

## 8. Lists and Dense Data

If the product includes lists or grids:

- Structure:
  - Use `FlatList` or `SectionList` for performance.
  - Provide sticky headers for long lists.

- Alignment:
  - Numbers right-aligned.
  - Text left-aligned.

- Interaction:
  - Sortable columns (if tabular) show a sort icon and direction.
  - Filters are clearly associated with the list and show result counts.

- Selection:
  - Clickable rows show visual feedback.
  - Keyboard focus moves predictably through rows.

- Responsiveness:
  - On small screens, use card-style rows summarizing key columns.

- Accessibility:
  - Use appropriate `accessibilityRole` and `accessibilityLabel`.

---

## 9. Accessibility

### 9.1 Semantic Structure

- Use `accessibilityRole="header"` for headings.
- Use semantic roles (`button`, `link`, `image`, `search`, `tab`).

### 9.2 Keyboard and Focus

- All interactive elements are reachable and operable via keyboard (Web/Android).
- Visible focus:
  - Strong focus outline or indicator with clear contrast.
- Focus order:
  - Follows a logical visual and reading order.
- Modals:
  - Trap focus while open.
  - Esc closes modal (Web).
  - Focus returns to triggering element on close.

### 9.3 Screen Readers and ARIA

- Controls have accessible names (`accessibilityLabel`).
- Informational images have descriptive `accessibilityLabel`.
- Decorative images use `importantForAccessibility="no-hide-descendants"` (Android) or `accessibilityElementsHidden` (iOS).
- Use `accessibilityLiveRegion` for important async updates where needed.

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
  - Source of truth: `mobile-app/constants/paper-theme.ts` (and `Colors.ts`).

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
   - Check layout, responsiveness, typography, color, components, navigation, forms, lists, and states.
4) Run an accessibility sweep:
   - Keyboard-only run (Web).
   - Screen reader smoke test on key screens (VoiceOver/TalkBack).
   - Contrast and target-size spot-check.
5) Run edge-content tests:
   - Long labels, dense data, pseudo-localized text.
6) Group findings into tickets:
   - P0: blockers and accessibility failures.
   - P1: important usability and consistency issues.
   - P2: visual polish and minor issues.

This document is the source of truth for UI/UX passes.
```
