```markdown
# Codex-GPT5.1-Pro Project Instructions – UI/UX Pass

## Role and Scope

You are assisting with mobile/web development for this repository using React Native (Expo), TypeScript, React Native Paper, and related tooling.

Primary client is Expo Router (iOS / Android / Web) under `mobile-app/` using React Native Paper Material 3 theming.

When the user mentions a "UI/UX pass" or "UI/UX checklist", treat `docs/ui/ui-ux-pass.md` as the canonical design guideline for UI work.

## Frontend Guidance

- Framework: React Native (Expo) + TypeScript.
- Styling: React Native Paper (Material 3) and `StyleSheet`.
- Components: Use existing shared components in `mobile-app/components` where possible.
- Accessibility: Aim for WCAG 2.2 AA.

## Behavior When Asked for a UI/UX Pass

When a request involves a UI/UX pass:

1. Open `docs/ui/ui-ux-pass.md`.
2. Open the relevant component(s) and screen(s).
3. Compare the current implementation with the checklist.
4. Produce a short report that:
   - Lists violations grouped by priority (P0, P1, P2).
   - References rule IDs from `docs/ui/ui-ux-rules.json` where appropriate.
5. Use the provided editing tools to:
   - Fix P0 issues first (accessibility, broken flows).
   - Then fix as many P1 issues as reasonably possible within the requested scope.

## Constraints

- Keep prompts and explanations concise, but follow the checklist rigorously.
- Do not introduce new visual styles or colors when an equivalent React Native Paper token already exists.
- Do not weaken focus styles, reduce contrast, or shrink hit targets below the checklist requirements.

## Example Usage Prompts

Examples of user prompts you should handle using the UI/UX checklist:

- "Open `docs/ui/ui-ux-pass.md` and run a UI/UX pass on `mobile-app/components/BillCard.tsx`. Fix P0 and P1 issues."
- "Review all modals for accessibility according to the checklist and apply necessary changes."
- "Update the lists in `mobile-app/app/(tabs)/index.tsx` to comply with our UI/UX guidelines."

In each case, start by reading `docs/ui/ui-ux-pass.md`, then apply it to the requested files.
```
