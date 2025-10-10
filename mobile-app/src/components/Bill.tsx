// mobile-app/src/components/Bill.tsx (modified)

import { useRouter } from "expo-router";
import React, { useState, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, IconButton, Text, useTheme, Button } from "react-native-paper";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { extractBillStatusDetails } from "@/lib/billStatus";
import { useAuth } from "@/providers/AuthProvider";

export interface Bill {
  id: number;
  bill_number: string;
  title: string;
  description: string | null;
  status: string | null;
  status_text?: string | null;
  status_date?: string | null;
  progress?: any;
  calendar?: any;
  history?: any;
  state_link: string | null;
  slug?: string | null;
  summary_simple: string | null;
  summary_medium: string | null;
  summary_complex: string | null;
  // Optional language‑specific summaries.  When switching to a non‑English
  // language, these fields will be used if present; otherwise the English
  // summaries are used as a fallback.
  summary_simple_es?: string | null;
  summary_medium_es?: string | null;
  summary_complex_es?: string | null;
  is_curated: boolean;
  original_text: string | null;
  change_hash: string;
  created_at: string;
  panel_review: any;
}

type BillHistoryEntry = {
  date?: string | null;
  action?: string | null;
  description?: string | null;
};

type BillProgressEntry = {
  date?: string | null;
  progress_step?: number | string | null;
  step?: number | string | null;
  status?: string | null;
  text?: string | null;
  event?: string | null;
  progress_event?: string | null;
};

export default function BillComponent({ bill }: { bill: Bill }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const userId = session?.user?.id;

  const [billDetails, setBillDetails] = useState({
    reaction_counts: {} as Record<string, number>,
    user_reaction: null as string | null,
    is_bookmarked: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchDetails = async () => {
      const { data, error } = await supabase.rpc("get_bill_details_for_user", {
        p_bill_id: bill.id,
        p_user_id: userId,
      });

      if (error) {
        console.error("Error fetching bill details:", error.message);
      } else if (data) {
        setBillDetails({
          reaction_counts: data.reaction_counts || {},
          user_reaction: data.user_reaction,
          is_bookmarked: data.is_bookmarked,
        });
      }
      setLoading(false);
    };

    fetchDetails();
  }, [bill.id, userId]);

  const handleBookmark = async () => {
    if (!userId) return;
    const previousBookmarkState = billDetails.is_bookmarked;
    setBillDetails((prev) => ({ ...prev, is_bookmarked: !previousBookmarkState }));

    const { error } = await supabase.rpc("toggle_bookmark_and_subscription", {
      p_bill_id: bill.id,
      p_user_id: userId,
    });

    if (error) {
      setBillDetails((prev) => ({ ...prev, is_bookmarked: previousBookmarkState }));
      console.error("Error toggling bookmark:", error);
      Toast.show({ type: "error", text1: "Error", text2: "Could not save your change." });
    } else {
      Toast.show({
        type: "success",
        text1: previousBookmarkState ? "Bookmark Removed" : "Bookmark Saved",
      });
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (!userId) return;
    const originalDetails = { ...billDetails };
    const currentReaction = billDetails.user_reaction;
    const newReaction = currentReaction === reactionType ? null : reactionType;

    const newCounts = { ...(billDetails.reaction_counts || {}) } as Record<string, number>;
    if (currentReaction) {
      newCounts[currentReaction] = (newCounts[currentReaction] || 1) - 1;
    }
    if (newReaction) {
      newCounts[newReaction] = (newCounts[newReaction] || 0) + 1;
    }

    setBillDetails({ ...billDetails, user_reaction: newReaction, reaction_counts: newCounts });

    const { error } = await supabase.rpc("handle_reaction", {
      p_bill_id: bill.id,
      p_user_id: userId,
      p_reaction_type: reactionType,
    });

    if (error) {
      setBillDetails(originalDetails);
      Toast.show({ type: "error", text1: "Error", text2: "Could not save your reaction." });
    }
  };

  const handlePress = () => {
    router.push(`/bill/${bill.id}`);
  };

  const formatToMMDDYYYY = (value?: string | null): string | null => {
    if (!value) return null;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${month}/${day}/${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear());
    return `${month}/${day}/${year}`;
  };

  // Derive timeline info from the bill's history for surface-level context.
  const historyInsights = useMemo(() => {
    const normalizeHistory = (raw: any): BillHistoryEntry[] => {
      if (!raw) return [] as BillHistoryEntry[];
      if (Array.isArray(raw)) return raw as BillHistoryEntry[];
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? (parsed as BillHistoryEntry[])
            : ([] as BillHistoryEntry[]);
        } catch {
          return [] as BillHistoryEntry[];
        }
      }
      return [] as BillHistoryEntry[];
    };

    const entries: BillHistoryEntry[] = normalizeHistory(bill.history).map(
      (entry: BillHistoryEntry) => {
        if (entry && typeof entry === "object") {
          const safeEntry = entry as Record<string, unknown>;
          const actionDate =
            (safeEntry.date as string | undefined) ??
            (safeEntry.action_date as string | undefined) ??
            (safeEntry.event_date as string | undefined) ??
            null;
          return {
            date: actionDate,
            action: (safeEntry.action as string | undefined) ?? null,
            description: (safeEntry.description as string | undefined) ?? null,
          } as BillHistoryEntry;
        }
        return { date: null, action: null, description: null };
      },
    );

    const normalizeProgress = (raw: any): BillProgressEntry[] => {
      if (!raw) return [] as BillProgressEntry[];
      if (Array.isArray(raw)) return raw as BillProgressEntry[];
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? (parsed as BillProgressEntry[])
            : ([] as BillProgressEntry[]);
        } catch {
          return [] as BillProgressEntry[];
        }
      }
      return [] as BillProgressEntry[];
    };

    const parseMs = (value?: string | null) => {
      if (!value) return null;
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, year, month, day] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date.getTime();
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    };

    const progressEntries = normalizeProgress(bill.progress);
    const introducedFromProgress = progressEntries.find((entry) => {
      const textBuckets = [entry.status, entry.text, entry.event, entry.progress_event]
        .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
        .filter(Boolean);
      const mentionsIntroduced = textBuckets.some((value) => value.includes("introduc"));
      const stepRaw = entry.progress_step ?? entry.step;
      const step = typeof stepRaw === "string" ? Number(stepRaw) : (stepRaw ?? null);
      return mentionsIntroduced || (typeof step === "number" && step <= 1);
    });

    const introducedDateRaw = introducedFromProgress?.date ?? null;

    let earliestMs: number | null = null;
    let earliestDate: string | null = null;
    let latestHistoryMs: number | null = null;
    let latestHistoryDateRaw: string | null = null;

    entries.forEach((entry: BillHistoryEntry) => {
      const ms = parseMs(entry.date ?? null);
      if (ms === null) return;
      if (earliestMs === null || ms < earliestMs) {
        earliestMs = ms;
        earliestDate = entry.date ?? null;
      }
      if (latestHistoryMs === null || ms > latestHistoryMs) {
        latestHistoryMs = ms;
        latestHistoryDateRaw = entry.date ?? null;
      }
    });

    let latestProgressMs: number | null = null;
    let latestProgressDateRaw: string | null = null;
    progressEntries.forEach((entry: BillProgressEntry) => {
      const ms = parseMs(entry.date ?? null);
      if (ms === null) return;
      if (latestProgressMs === null || ms > latestProgressMs) {
        latestProgressMs = ms;
        latestProgressDateRaw = entry.date ?? null;
      }
    });

    const statusMs = parseMs(bill.status_date ?? null);
    let latestDateRaw: string | null = latestHistoryDateRaw;
    let latestMs: number | null = latestHistoryMs;

    const considerCandidate = (candidateMs: number | null, candidateRaw: string | null) => {
      if (candidateMs === null || candidateRaw === null) return;
      if (latestMs === null || candidateMs > latestMs) {
        latestMs = candidateMs;
        latestDateRaw = candidateRaw;
      }
    };

    considerCandidate(latestProgressMs, latestProgressDateRaw);
    considerCandidate(statusMs, bill.status_date ?? null);

    const proposedDate = formatToMMDDYYYY(
      introducedDateRaw ?? earliestDate ?? bill.status_date ?? bill.created_at ?? null,
    );
    const latestDate = latestDateRaw ? formatToMMDDYYYY(latestDateRaw) : null;

    return { proposedDate, latestDate };
  }, [bill.history, bill.progress, bill.status_date, bill.created_at]);

  // Choose summary based on current language.  If we're viewing the app in
  // Spanish and a Spanish summary is available, use it; otherwise fall back
  // to the English simple summary.  We only show a short preview on the card.
  const lang = i18n?.language ?? "en";
  const summary =
    lang.startsWith("es") && bill.summary_simple_es ? bill.summary_simple_es : bill.summary_simple;

  const statusDetails = useMemo(() => extractBillStatusDetails(bill), [bill]);
  const statusText = statusDetails.statusLabel ?? null;
  const statusDateFormatted = formatToMMDDYYYY(statusDetails.statusDate);

  const lastActionDate = historyInsights.latestDate ?? statusDateFormatted ?? null;

  const metaColor = theme.colors.onSurfaceVariant;
  const summaryColor = theme.colors.onSurfaceVariant;
  const reactionActiveColor = theme.colors.primary;

  return (
    <Card
      mode="elevated"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceContainerLowest,
          borderColor: theme.colors.outlineVariant,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Pressable onPress={handlePress} android_ripple={{ color: theme.colors.surfaceVariant }}>
        <Card.Content style={styles.content}>
          <View style={styles.header}>
            <Text
              variant="titleMedium"
              style={[styles.billNumber, { color: theme.colors.primary }]}
            >
              {bill.bill_number}
            </Text>
            <IconButton
              icon={billDetails.is_bookmarked ? "bookmark" : "bookmark-outline"}
              iconColor={theme.colors.primary}
              containerColor={theme.colors.surfaceContainerHigh}
              size={24}
              onPress={handleBookmark}
              disabled={loading}
              accessibilityLabel="Bookmark this bill"
            />
          </View>
          <Text variant="bodyLarge" style={styles.title}>
            {bill.title}
          </Text>
          {summary && (
            <Text
              variant="bodyMedium"
              numberOfLines={3}
              style={[styles.summary, { color: summaryColor }]}
            >
              {summary}
            </Text>
          )}
          <View style={styles.metaContainer}>
            {historyInsights.proposedDate ? (
              <Text variant="bodySmall" style={[styles.metaText, { color: metaColor }]}>
                {t("bill.meta.firstProposed", {
                  defaultValue: "First proposed {{date}}",
                  date: historyInsights.proposedDate,
                })}
              </Text>
            ) : null}
            {lastActionDate ? (
              <Text variant="bodySmall" style={[styles.metaText, { color: metaColor }]}>
                {t("bill.meta.lastAction", {
                  defaultValue: "Last action: {{date}}",
                  date: lastActionDate,
                })}
              </Text>
            ) : null}
            {statusText ? (
              <Text variant="bodySmall" style={[styles.metaText, { color: metaColor }]}>
                {t("bill.meta.status", {
                  defaultValue: "Status: {{status}}{{dateSuffix}}",
                  status: statusText,
                  dateSuffix: statusDateFormatted
                    ? t("bill.meta.statusDateSuffix", {
                        defaultValue: " ({{date}})",
                        date: statusDateFormatted,
                      })
                    : "",
                })}
              </Text>
            ) : null}
          </View>
        </Card.Content>
      </Pressable>
      <Card.Actions style={styles.actions}>
        <View style={styles.reactionContainer}>
          <Button
            icon="thumb-up"
            mode={billDetails.user_reaction === "upvote" ? "contained" : "outlined"}
            buttonColor={billDetails.user_reaction === "upvote" ? reactionActiveColor : undefined}
            textColor={
              billDetails.user_reaction === "upvote"
                ? theme.colors.onPrimary
                : theme.colors.onSurfaceVariant
            }
            onPress={() => handleReaction("upvote")}
            disabled={loading}
            style={styles.reactionButton}
            compact
          >
            {billDetails.reaction_counts.upvote || 0}
          </Button>
          <Button
            icon="thumb-down"
            mode={billDetails.user_reaction === "downvote" ? "contained" : "outlined"}
            buttonColor={
              billDetails.user_reaction === "downvote" ? theme.colors.secondary : undefined
            }
            textColor={
              billDetails.user_reaction === "downvote"
                ? theme.colors.onSecondary
                : theme.colors.onSurfaceVariant
            }
            onPress={() => handleReaction("downvote")}
            disabled={loading}
            style={styles.reactionButton}
            compact
          >
            {billDetails.reaction_counts.downvote || 0}
          </Button>
        </View>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 18,
    borderRadius: 24,
    borderWidth: 1,
  },
  content: {
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billNumber: { fontWeight: "700" },
  title: { marginBottom: 4 },
  summary: { marginTop: 4 },
  metaContainer: { marginTop: 12, gap: 4 },
  metaText: {},
  actions: { paddingHorizontal: 12, paddingBottom: 12 },
  reactionContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  reactionButton: {
    borderRadius: 18,
  },
});
