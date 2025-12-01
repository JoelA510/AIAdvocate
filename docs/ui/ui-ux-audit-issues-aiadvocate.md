# UI/UX Audit Issues: AIAdvocate

This report details the findings from the UI/UX audit conducted against `docs/ui/ui-ux-pass.md` and `docs/ui/ui-ux-rules.json`.

## 1. Core Navigation & Layouts

### **Root Layout** (`mobile-app/app/_layout.tsx`)
- **Issues:**
  - [RESOLVED] `color_hardcoded` (P1): `styles.errorContainer` uses `Colors.light` directly instead of theme tokens.
  - [RESOLVED] `typography_hardcoded` (P1): `styles.errorTitle` has hardcoded `fontWeight: "700"`.
  - [RESOLVED] `color_hardcoded` (P1): Fallback screen uses `Colors.light`/`Colors.dark` directly.

### **Header Banner** (`mobile-app/components/ui/HeaderBanner.tsx`)
- **Issues:**
  - [RESOLVED] `typography_hardcoded` (P1): Now uses `theme.fonts.labelLarge`.
  - [RESOLVED] `color_hardcoded` (P1): Now uses `theme.colors.shadow`.
  - [RESOLVED] `layout_spacing` (P1): `HEADER_HEIGHT` updated to 56.

### **Footer Nav** (`mobile-app/src/components/FooterNav.tsx`)
- **Issues:**
  - [RESOLVED] `typography_hardcoded` (P1): `styles.label` has hardcoded `fontWeight: "600"` and `fontSize: 12`. Should use `theme.fonts.labelSmall`.
  - [RESOLVED] `color_hardcoded` (P1): `shadowColor` falls back to `#000`.

## 2. Bill Discovery

### **Bill Feed** (`mobile-app/app/(tabs)/index.tsx`)
- **Issues:**
  - [RESOLVED] `layout_border_radius` (P1): `styles.header` has hardcoded `borderRadius: 24`. Should use `theme.roundness * 6` (or similar).
  - [RESOLVED] `layout_borders` (P1): `styles.header` has hardcoded `borderWidth: 1`.
  - `component_elevation` (P1): `Searchbar` has `elevation: 0` override.

### **Active Bills** (`mobile-app/app/(tabs)/active.tsx`)
- **Issues:**
  - [RESOLVED] `layout_border_radius` (P1): Now uses `theme.roundness * 6`.
  - [RESOLVED] `layout_borders` (P1): `borderWidth: 1` kept but color is themed.
  - [RESOLVED] `layout_spacing` (P1): Padding standardized to 16.

### **Saved Bills** (`mobile-app/app/(tabs)/saved.tsx`)
- **Issues:**
  - `layout_border_radius` (P1): `styles.content` has hardcoded `borderRadius: 28`.
  - `layout_borders` (P1): `styles.content` has hardcoded `borderWidth: 1`.
  - `layout_spacing` (P1): `marginTop: 12` is okay (4px scale), but check consistency with other screens.

### **Bill Detail** (`mobile-app/app/bill/[id].tsx`)
- **Issues:**
  - [RESOLVED] `typography_hardcoded` (P1): Removed hardcoded bold weights, relying on variants.
  - [RESOLVED] `typography_hardcoded` (P1): Pros/Cons labels use theme fonts.
  - [RESOLVED] `typography_hardcoded` (P1): `translatingText` uses `bodyLarge` and theme color.
  - [RESOLVED] `layout_spacing` (P1): Removed negative margin hack.

### **Bill Card** (`mobile-app/src/components/Bill.tsx`)
- **Issues:**
  - `layout_borders` (P1): `styles.card` has `borderWidth: 1`.
  - `layout_border_radius` (P1): `styles.reactionButton` has `borderRadius: 18`.

## 3. Advocacy & Community

### **Advocacy Hub** (`mobile-app/app/(tabs)/advocacy.tsx`)
- **Issues:**
  - `layout_border_radius` (P1): `styles.content` has hardcoded `borderRadius: 28`.
  - `layout_borders` (P1): `styles.content` has hardcoded `borderWidth: 1`.
  - `layout_spacing` (P1): `padding: 20` (not 4/8 scale, usually 16 or 24).
  - `layout_border_radius` (P1): `styles.menuButton` has `borderRadius: 20`.

### **Love Never Fails** (`mobile-app/app/(tabs)/lnf.tsx`)
- **Issues:**
  - `color_hardcoded` (P1): `styles.adminButton` uses `rgba(128, 128, 128, 0.1)`.

### **Legislator Profile** (`mobile-app/app/legislator/[id].tsx`)
- **Issues:**
  - [RESOLVED] `color_hardcoded` (P1): Uses `theme.colors.background` dynamically. Could use `ThemedView` for consistency, but not a P1 issue.

## 4. Admin & Settings

### **Admin Login** (`mobile-app/app/admin/login.tsx`)
- **Issues:**
  - `layout_responsive` (P1): `styles.card` has `maxWidth: 400`. While good for web, ensure it doesn't look odd on tablets.

### **Admin Dashboard** (`mobile-app/app/admin/account.tsx`)
- **Issues:**
  - `layout_spacing` (P1): `styles.card` has `margin: 16`.
  - `color_hardcoded` (P1): `styles.qrCodeContainer` has hardcoded `backgroundColor: 'white'`.

### **Bill Management** (`mobile-app/app/admin/bills.tsx`)
- **Issues:**
  - `layout_border_radius` (P1): `styles.header` has hardcoded `borderRadius: 24`.
  - `layout_borders` (P1): `styles.header` has hardcoded `borderWidth: 1`.
  - `layout_border_radius` (P1): `styles.searchbar` has `borderRadius: 22`.
  - `layout_borders` (P1): `styles.searchbar` has hardcoded `borderWidth: 1`.
  - `layout_spacing` (P1): `padding: 14` in header (not 4/8 scale).

### **User Management** (`mobile-app/app/admin/users.tsx`)
- **Issues:**
  - `layout_border_radius` (P1): `styles.header` has hardcoded `borderRadius: 24`.
  - `layout_borders` (P1): `styles.header` has hardcoded `borderWidth: 1`.
  - `layout_spacing` (P1): `padding: 14` in header (not 4/8 scale).

### **System Logs** (`mobile-app/app/admin/logs.tsx`)
- **Issues:**
  - `layout_border_radius` (P1): `styles.header` has hardcoded `borderRadius: 24`.
  - `layout_borders` (P1): `styles.header` has hardcoded `borderWidth: 1`.
  - `layout_spacing` (P1): `padding: 14` in header (not 4/8 scale).
  - `color_hardcoded` (P1): `styles.searchbar` has `borderColor: 'rgba(0,0,0,0.1)'`.
  - `layout_borders` (P1): `styles.searchbar` has hardcoded `borderWidth: 1`.

1.  **Theme Tokens:** Replace all hardcoded colors (e.g., `"gray"`, `#000`, `rgba(...)`) with `theme.colors.*`.
2.  **Typography:** Replace hardcoded `fontSize` and `fontWeight` with `theme.fonts.*` variants (e.g., `labelLarge`, `bodyMedium`).
3.  **Spacing & Layout:** Standardize border radii (e.g., `theme.roundness * 4`) and spacing (multiples of 4 or 8).
4.  **Components:** Use `ThemedText` correctly or `Text` with `variant` prop from React Native Paper.
