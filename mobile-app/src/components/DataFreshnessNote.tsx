// mobile-app/src/components/DataFreshnessNote.tsx
//
// One or two small lines saying when bill data was last checked against the
// Legislature's records. Shown once above the feed and once on a bill's page,
// not on every card: every bill is checked in the same daily pass, so the date
// is the same for all of them.

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  DATA_FRESHNESS_QUERY_KEY,
  describeFreshness,
  fetchDataFreshness,
} from "@/lib/dataFreshness";

export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export default function DataFreshnessNote() {
  const { t } = useTranslation();
  const theme = useTheme();
  // The update times are read so that every poll re-renders this component,
  // including one that returns unchanged data or fails: the age below is
  // measured against the clock, and a feed left open (or an app brought back
  // from the background, where nothing else triggers a refetch) must cross the
  // stale threshold on its own.
  const { data, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: DATA_FRESHNESS_QUERY_KEY,
    queryFn: fetchDataFreshness,
    // The value changes once a day.
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Loading, or the lookup failed: say nothing rather than guess. A failed
  // lookup is not evidence that the bill data is old.
  if (!data) return null;

  const view = describeFreshness(data, Math.max(Date.now(), dataUpdatedAt, errorUpdatedAt));
  const stale = view.state === "stale";

  return (
    <View style={styles.container} accessibilityRole="text" testID="data-freshness-note">
      <Text
        variant="bodySmall"
        style={{ color: stale ? theme.colors.error : theme.colors.onSurfaceVariant }}
      >
        {stale
          ? view.checkedDate
            ? t("freshness.stale", {
                defaultValue:
                  "Bill information may be out of date. Last checked against Legislature records {{date}}.",
                date: view.checkedDate,
              })
            : t(
                "freshness.staleUnknown",
                "Bill information may be out of date. We could not confirm when it was last checked.",
              )
          : t("freshness.checked", {
              defaultValue: "Checked against Legislature records {{date}}",
              date: view.checkedDate,
            })}
      </Text>
      {view.quietSince ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {t("freshness.quiet", {
            defaultValue:
              "No tracked bill has had legislative action since {{date}}. The Legislature may be in recess.",
            date: view.quietSince,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingVertical: 8, gap: 2 },
});
