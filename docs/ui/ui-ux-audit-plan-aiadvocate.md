# UI/UX Audit Plan: AIAdvocate

This document outlines the scope and risk assessment for the UI/UX audit of the AIAdvocate application.

## 1. Core Navigation & Layouts

| Surface | File Path(s) | Description | Risk | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Root Layout** | `mobile-app/app/_layout.tsx` | Global providers, error boundaries, and fallback error screens. | **HIGH** | Shared |
| **Tab Layout** | `mobile-app/app/(tabs)/_layout.tsx` | Bottom tab navigation configuration. | **HIGH** | Shared |
| **Header Banner** | `mobile-app/components/ui/HeaderBanner.tsx` | Global header with logo and language switcher. | **HIGH** | Shared |
| **Footer Nav** | `mobile-app/src/components/FooterNav.tsx` | Custom bottom navigation component. | **HIGH** | Shared |

## 2. Bill Discovery (Core Flow)

| Surface | File Path(s) | Description | Risk | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Bill Feed** | `mobile-app/app/(tabs)/index.tsx` | Main list of bills with search and session filtering. | **HIGH** | Shared |
| **Active Bills** | `mobile-app/app/(tabs)/active.tsx` | List of "active" bills (user specific or curated). | **HIGH** | Shared |
| **Saved Bills** | `mobile-app/app/(tabs)/saved.tsx` | User's bookmarked bills. | **MEDIUM** | Shared |
| **Bill Detail** | `mobile-app/app/bill/[id].tsx` | Detailed view of a bill, including translation, summary, and survivor panel review. | **HIGH** | Shared |
| **Bill Card** | `mobile-app/src/components/Bill.tsx` | Reusable card component for displaying bill summaries in lists. | **HIGH** | Shared |

## 3. Advocacy & Community

| Surface | File Path(s) | Description | Risk | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Advocacy Hub** | `mobile-app/app/(tabs)/advocacy.tsx` | Hub for advocacy tools (Find Rep, etc.). | **MEDIUM** | Shared |
| **Love Never Fails** | `mobile-app/app/(tabs)/lnf.tsx` | LNF news feed / web view. | **MEDIUM** | Shared |
| **Legislator Profile** | `mobile-app/app/legislator/[id].tsx` | Legislator details and voting history. | **MEDIUM** | Shared |
| **Find Your Rep** | `mobile-app/src/components/FindYourRep.tsx` | Component to look up legislators by address. | **MEDIUM** | Shared |

## 4. Admin & Settings (Internal/Utility)

| Surface | File Path(s) | Description | Risk | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Login** | `mobile-app/app/admin/login.tsx` | Login screen for admins. | **LOW** | Shared |
| **Admin Dashboard** | `mobile-app/app/admin/account.tsx` | Admin account overview. | **LOW** | Shared |
| **Bill Management** | `mobile-app/app/admin/bills.tsx` | Interface to edit bill summaries and translations. | **LOW** | Shared |
| **User Management** | `mobile-app/app/admin/users.tsx` | Interface to manage users. | **LOW** | Shared |
| **System Logs** | `mobile-app/app/admin/logs.tsx` | View system logs. | **LOW** | Shared |
| **Language Select** | `mobile-app/app/language.tsx` | Language selection screen. | **LOW** | Shared |

## 5. Shared Components

| Surface | File Path(s) | Description | Risk | Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Themed Text** | `mobile-app/components/ThemedText.tsx` | Typography wrapper. | **HIGH** | Shared |
| **Themed View** | `mobile-app/components/ThemedView.tsx` | Layout wrapper. | **HIGH** | Shared |
| **Empty State** | `mobile-app/src/components/EmptyState.tsx` | Generic empty state display. | **MEDIUM** | Shared |
| **Bill Skeleton** | `mobile-app/src/components/BillSkeleton.tsx` | Loading state for bills. | **MEDIUM** | Shared |
| **Language Button** | `mobile-app/components/ui/LanguageMenuButton.tsx` | Header button for language switching. | **MEDIUM** | Shared |
