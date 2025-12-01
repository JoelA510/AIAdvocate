# UI/UX Audit Plan

## 1. Rules Summary

### P0 – Must Fix (Blockers)
- **Accessibility**: Contrast < 4.5:1, missing focus indicators, keyboard traps, small touch targets (< 24dp).
- **Broken Flows**: Dead ends, unclosable modals, critical task failures.
- **Content**: Unreadable text, clipped/overlapping content.
- **Forms**: Missing labels (placeholders != labels).

### P1 – Strongly Recommended
- **Layout**: Inconsistent spacing (use 4/8dp scale), alignment issues.
- **Typography**: Undefined styles, poor hierarchy.
- **Components**: Inconsistent states (hover, focus, disabled), missing feedback (loading/success).
- **Navigation**: Unclear active state, unpredictable back behavior.
- **Lists/Tables**: Missing sort/filter indicators, poor responsiveness.

---

## 2. UI Surfaces & Risk Assessment

### Shared & Global (High Priority)
These affect the entire application and should be audited first to establish a baseline.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **Root Layout** | `mobile-app/app/_layout.tsx` | Main app shell, navigation structure. | **HIGH** |
| **Tab Layout** | `mobile-app/app/(tabs)/_layout.tsx` | Main tab navigation. | **HIGH** |

### Core Workflows

#### Bill Discovery & Detail
The primary value loop for users.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **Bill Feed** | `mobile-app/app/(tabs)/index.tsx` | Main feed of bills. | **HIGH** |
| **Bill Detail** | `mobile-app/app/bill/[id].tsx` | Detailed view of a bill. | **HIGH** |
| **Bill Card** | `mobile-app/components/BillCard.tsx` | Reused card component. | **MEDIUM** |

#### Legislator Lookup
Key feature for advocacy.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **Lookup Screen** | `mobile-app/app/(tabs)/legislators.tsx` | Search/Lookup screen. | **MEDIUM** |

### Entry Points

#### Onboarding
Critical for first impressions.

| Component | Path | Description | Risk |
|-----------|------|-------------|------|
| **Onboarding** | `mobile-app/app/onboarding.tsx` (or similar) | First run experience. | **MEDIUM** |

---

## 3. Recommended Audit Order

1.  **Global & Shared**:
    - Audit `_layout.tsx` and `(tabs)/_layout.tsx`.
    - **Why**: Fixes here propagate everywhere.

2.  **Bill Feed & Detail (High Risk)**:
    - Deep dive into `index.tsx` and `bill/[id].tsx`.
    - Focus on list performance, card accessibility, and reading experience.

3.  **Entry Points**:
    - Audit Onboarding.
    - **Why**: Important for acquisition.

## 4. Execution Strategy
- **Tools**: Expo Go (iOS/Android), Web Browser (Chrome DevTools), Screen Readers (VoiceOver/TalkBack).
- **Output**: Create a `docs/ui/ui-ux-audit-findings.md` (or similar) logging P0/P1 issues found, grouped by component.
