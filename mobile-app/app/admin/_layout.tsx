// Admin is a WEB-ONLY surface. Every route file in this directory must be a
// one-line re-export from src/features/admin/<name>, which must have both a
// .web.tsx real screen and a .tsx stub re-exporting AdminWebOnly — that keeps
// staff email/password login out of the iOS/Android bundles (Play Data
// Safety). Do not add screens directly here, and do not use .web.tsx files
// inside app/ (expo-router bundles them on every platform). Enforced by
// scripts/check-admin-web-only.js; see DEPLOYMENT_GUIDE.md.
import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="bills" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
