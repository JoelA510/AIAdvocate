# UI/UX Audit Plan: AIAdvocate

This plan outlines the major UI surfaces to be audited against the `docs/ui/ui-ux-pass.md` guidelines.

## 1. Core Navigation & Layouts (Mobile/Web Shared)

| Surface | File Path | Description | Risk Level | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Root Layout** | `mobile-app/app/_layout.tsx` | Global providers, error handling, and splash screen logic. | HIGH | Shared |
| **Tab Layout** | `mobile-app/app/(tabs)/_layout.tsx` | Main bottom navigation configuration. | HIGH | Shared |
| **Header Banner** | `mobile-app/components/HeaderBanner.tsx` | Global branded header. | MEDIUM | Shared |
| **Footer Nav** | `mobile-app/components/FooterNav.tsx` | Custom bottom navigation bar implementation. | HIGH | Shared |

## 2. Bill Discovery (Public)

| Surface | File Path | Description | Risk Level | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Bill Feed (Home)** | `mobile-app/app/(tabs)/index.tsx` | Main list of bills with search and filtering. | HIGH | Shared |
| **Active Bills** | `mobile-app/app/(tabs)/active.tsx` | Filtered view of active legislation. | MEDIUM | Shared |
| **Saved Bills** | `mobile-app/app/(tabs)/saved.tsx` | User's bookmarked bills. | MEDIUM | Shared |
| **Bill Detail** | `mobile-app/app/bill/[id].tsx` | Detailed view of a single bill, including summary, pros/cons, and actions. | HIGH | Shared |
| **Bill Card** | `mobile-app/components/Bill.tsx` | Reusable card component for displaying bill info in lists. | HIGH | Shared |

## 3. Advocacy & Community

| Surface | File Path | Description | Risk Level | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Advocacy Hub** | `mobile-app/app/(tabs)/advocacy.tsx` | Resources and actions for advocacy. | MEDIUM | Shared |
| **Love Never Fails** | `mobile-app/app/(tabs)/lnf.tsx` | Special community hub/resources page. | MEDIUM | Shared |
| **Legislator Profile** | `mobile-app/app/legislator/[id].tsx` | Detailed view of a legislator. | MEDIUM | Shared |

## 4. Admin & Settings

| Surface | File Path | Description | Risk Level | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Login** | `mobile-app/app/admin/login.tsx` | Authentication screen for admins. | LOW | Shared |
| **Admin Dashboard** | `mobile-app/app/admin/account.tsx` | Main admin overview. | LOW | Shared |
| **Bill Management** | `mobile-app/app/admin/bills.tsx` | Admin interface for managing bills. | MEDIUM | Shared |
| **User Management** | `mobile-app/app/admin/users.tsx` | Admin interface for managing users. | LOW | Shared |
| **System Logs** | `mobile-app/app/admin/logs.tsx` | View system logs. | LOW | Shared |
| **Language Selection** | `mobile-app/app/language.tsx` | Screen to change app language. | LOW | Shared |

## 5. Shared Components & UI Elements

| Surface | File Path | Description | Risk Level | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Empty State** | `mobile-app/components/EmptyState.tsx` | Generic empty state display. | LOW | Shared |
| **Bill Skeleton** | `mobile-app/components/BillSkeleton.tsx` | Loading state for bill cards. | LOW | Shared |
| **Themed Text** | `mobile-app/components/ThemedText.tsx` | Wrapper for text with theme support. | MEDIUM | Shared |
| **Themed View** | `mobile-app/components/ThemedView.tsx` | Wrapper for views with theme support. | MEDIUM | Shared |
| **Language Button** | `mobile-app/components/ui/LanguageMenuButton.tsx` | Button to trigger language selection. | LOW | Shared |
| **Icon Symbol** | `mobile-app/components/ui/IconSymbol.tsx` | Cross-platform icon wrapper. | LOW | Shared |

## Audit Strategy

1.  **Phase 1 (High Risk):** Focus on Global Layouts, Bill Feed, Bill Detail, and Bill Card. These are the most visible and used parts of the app.
2.  **Phase 2 (Medium Risk):** Audit Advocacy, LNF, Legislator profiles, and secondary lists (Active/Saved).
3.  **Phase 3 (Admin & Low Risk):** Review Admin screens and utility components.

**Note:** All audits must verify compliance with `mobile-app/constants/paper-theme.ts` and ensure accessibility (WCAG 2.2 AA).
