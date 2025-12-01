# UI/UX Audit Findings

## Global & Shared Components

### Root Layout (`mobile-app/app/_layout.tsx`)
- **Issues**:
    - [ ] `color_hardcoded` (P1): Error screen uses hardcoded colors (`#fff`, `#333`, `#666`) instead of theme colors.
    - [ ] `typography_hardcoded` (P1): Error screen uses hardcoded font weights and sizes instead of theme variants.

## Core Workflows

### Bill Feed (`mobile-app/app/(tabs)/index.tsx`)
- **Issues**:
    - [ ] `layout_spacing` (P1): Header uses hardcoded padding/margin that might not align with 4/8dp grid perfectly (e.g. `padding: 14`).
    - [ ] `component_consistency` (P1): Searchbar uses hardcoded `fontSize: 16` and `borderRadius`.
    - [ ] `color_hardcoded` (P1): Shadow color defaults to `#000`.

### Bill Component (`mobile-app/src/components/Bill.tsx`)
- **Issues**:
    - [ ] `typography_hardcoded` (P1): `billNumber` uses `fontWeight: "700"`.
    - [ ] `layout_spacing` (P1): Card uses hardcoded `borderRadius: 24`, `borderWidth: 1`.
    - [ ] `color_hardcoded` (P1): Shadow color defaults to `#000`.
    - [ ] `component_consistency` (P1): Reaction buttons use `borderRadius: 18`.

### Bill Detail (`mobile-app/app/bill/[id].tsx`)
- **Issues**:
    - [ ] `color_hardcoded` (P1): "Pros" uses `color: "green"`, "Cons" uses `color: "red"`. Should use `theme.colors.primary` (or success) and `theme.colors.error`.
    - [ ] `typography_hardcoded` (P1): `fontWeight: "bold"` used on titles instead of relying on Text variants.
    - [ ] `component_consistency` (P1): Mix of `ActivityIndicator` (RN) and `PaperActivityIndicator` (Paper).
    - [ ] `layout_spacing` (P1): `marginLeft: -8` in actions container is a hacky fix for spacing.

## Legislator Lookup (`mobile-app/app/(tabs)/legislators.tsx`)
- **Issues**:
    - [ ] *Pending review*
