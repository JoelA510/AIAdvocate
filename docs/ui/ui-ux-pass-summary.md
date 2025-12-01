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
