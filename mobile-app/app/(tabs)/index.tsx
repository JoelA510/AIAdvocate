import { useState, useEffect, useMemo, useRef } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar, SegmentedButtons, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { supabase } from "../../src/lib/supabase";
import { fetchTranslationsForBills } from "../../src/lib/translation";

const SESSION_FILTER_ENABLED = false; // Set to true once the 2027-2028 cycle should be exposed to users.
const SESSION_ALL = "all";

const extractSessionLabel = (stateLink: string | null | undefined): string | null => {
  if (!stateLink) return null;
  const match = stateLink.match(/bill_id=(\d{4})(\d{4})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
};

const buildOrIlikeFilter = (fields: string[], raw: string) => {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\)/g, "\\)")
    .replace(/\(/g, "\\(");
  const pattern = `%${escaped}%`;
  return fields.map((field) => `${field}.ilike.${pattern}`).join(",");
};

const sortBills = (items: any[] | null | undefined) => {
  const toRank = (value: any) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const toTime = (value: any) => {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  return [...(items ?? [])].sort((a, b) => {
    const aRank = toRank(a?.rank);
    const bRank = toRank(b?.rank);
    if (aRank !== null || bRank !== null) {
      const safeARank = aRank ?? Number.NEGATIVE_INFINITY;
      const safeBRank = bRank ?? Number.NEGATIVE_INFINITY;
      if (safeBRank !== safeARank) return safeBRank - safeARank;
    }

    const curatedDiff = Number(Boolean(b?.is_curated)) - Number(Boolean(a?.is_curated));
    if (curatedDiff !== 0) return curatedDiff;

    const bTime = toTime(b?.status_date ?? b?.created_at);
    const aTime = toTime(a?.status_date ?? a?.created_at);
    if (bTime !== aTime) return bTime - aTime;

    return (b?.id ?? 0) - (a?.id ?? 0);
  });
};

export default function BillsHomeScreen() {
  const { t, i18n } = useTranslation();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sessionFilter, setSessionFilter] = useState<string>(SESSION_ALL);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const requestTokenRef = useRef(0);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;

  useEffect(() => {
    const controller = new AbortController();
    requestTokenRef.current += 1;
    const token = requestTokenRef.current;
    const trimmed = searchQuery.trim();
    const billNumberRegex = /^[A-Za-z]{2,3}\s*\d+$/;

    const fetchBills = async () => {
      setLoading(true);
      try {
        let data: any[] = [];

        if (!trimmed) {
          const { data: d, error: e } = await supabase
            .from("bills")
            .select("*")
            .abortSignal(controller.signal)
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (token !== requestTokenRef.current || controller.signal.aborted) return;
          if (e) throw e;
          data = d ?? [];
        } else if (billNumberRegex.test(trimmed)) {
          const processed = trimmed.replace(/\s/g, "");
          const { data: d, error: e } = await supabase
            .from("bills")
            .select("*")
            .abortSignal(controller.signal)
            .ilike("bill_number", `%${processed}%`)
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (token !== requestTokenRef.current || controller.signal.aborted) return;
          if (e) throw e;
          data = d ?? [];
        } else {
          const { data: d, error: e } = await supabase.rpc(
            "search_bills",
            {
              p_query: trimmed,
            },
            {
              signal: controller.signal,
            },
          );
          if (token !== requestTokenRef.current || controller.signal.aborted) return;
          if (!e) {
            data = d ?? [];
          } else if (
            e.code === "42883" ||
            /function public\.search_bills/i.test(e.message ?? "") ||
            /schema cache/i.test(e.message ?? "") ||
            /column .*search/i.test(e.message ?? "")
          ) {
            const orFilter = buildOrIlikeFilter(["bill_number", "title", "description"], trimmed);
            const { data: fallbackData, error: fallbackError } = await supabase
              .from("bills")
              .select("*")
              .abortSignal(controller.signal)
              .or(orFilter)
              .order("is_curated", { ascending: false })
              .order("status_date", { ascending: false })
              .order("created_at", { ascending: false })
              .order("id", { ascending: false });
            if (token !== requestTokenRef.current || controller.signal.aborted) return;
            if (fallbackError) throw fallbackError;
            data = fallbackData ?? [];
          } else {
            throw e;
          }
        }

        const sessionSet = new Set<string>();
        (data ?? []).forEach((item) => {
          const session = extractSessionLabel(item?.state_link);
          if (session) sessionSet.add(session);
        });
        if (token !== requestTokenRef.current || controller.signal.aborted) return;

        if (sessionSet.size) {
          setAvailableSessions((prev) => {
            const combined = new Set(prev);
            sessionSet.forEach((session) => combined.add(session));
            return Array.from(combined).sort((a, b) => b.localeCompare(a));
          });
        }

        let filtered = data ?? [];
        if (sessionFilter !== SESSION_ALL) {
          filtered = filtered.filter(
            (item) => extractSessionLabel(item?.state_link) === sessionFilter,
          );
        }

        if (token !== requestTokenRef.current || controller.signal.aborted) return;

        setBills(sortBills(filtered));
        setError(null);
      } catch (err: any) {
        if (token !== requestTokenRef.current || controller.signal.aborted) return;
        if (err?.name === "AbortError") return;
        setError(err.message);
        setBills([]);
      } finally {
        if (token !== requestTokenRef.current || controller.signal.aborted) return;
        setLoading(false);
      }
    };

    const searchTimeout = setTimeout(fetchBills, 300);
    return () => {
      controller.abort();
      clearTimeout(searchTimeout);
      setAvailableSessions([]);
    };
  }, [searchQuery, sessionFilter]);

  // Stable list of visible IDs; avoids listing `bills` as a dependency.
  const ids = useMemo(() => bills.map((b) => b.id), [bills]);
  const idsKey = useMemo(() => ids.join(","), [ids]);

  useEffect(() => {
    if (sessionFilter !== SESSION_ALL && !availableSessions.includes(sessionFilter)) {
      setSessionFilter(SESSION_ALL);
    }
  }, [availableSessions, sessionFilter]);

  const sessionOptions = useMemo(() => {
    const unique = new Set<string>([SESSION_ALL, ...availableSessions]);
    return Array.from(unique);
  }, [availableSessions]);

  const sessionButtons = useMemo(
    () =>
      sessionOptions.map((value) => ({
        value,
        label: value === SESSION_ALL ? t("sessions.all", "All") : value,
      })),
    [sessionOptions, t],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (i18n.language === "en") return;
      if (!ids.length) return;

      try {
        const map = await fetchTranslationsForBills(ids, i18n.language);
        if (!alive || !Object.keys(map).length) return;

        setBills((prev) =>
          prev.map((b) => {
            const tr = map[b.id];
            if (!tr) return b;
            return {
              ...b,
              title: tr.title ?? b.title,
              description: tr.description ?? b.description,
              summary_simple_es: tr.summary_simple ?? (b as any).summary_simple_es,
              summary_medium_es: tr.summary_medium ?? (b as any).summary_medium_es,
              summary_complex_es: tr.summary_complex ?? (b as any).summary_complex_es,
              original_text_es: tr.original_text ?? (b as any).original_text_es,
            };
          }),
        );
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      alive = false;
    };
  }, [i18n.language, idsKey, ids]);

  const renderContent = () => {
    if (loading) {
      return (
        <FlatList
          data={Array.from({ length: 5 })}
          renderItem={() => <BillSkeleton />}
          keyExtractor={(_, index) => `skeleton-${index}`}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        />
      );
    }
    if (error) {
      return (
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={t("error.title", "An Error Occurred")}
          message={t(
            "home.error",
            `We couldn't fetch the bills. Please try again later. \n(${error})`,
          )}
        />
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyState
          icon="file-search-outline"
          title={t("home.emptyTitle", "No Bills Found")}
          message={
            searchQuery
              ? t(
                  "home.emptyWithQuery",
                  `We couldn't find any bills matching "${searchQuery}". Try another search.`,
                )
              : t("home.emptyNoQuery", "There are no bills to display at the moment.")
          }
        />
      );
    }
    return (
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <BillComponent bill={item} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
            borderColor: colors.outlineVariant ?? theme.colors.outline,
            shadowColor: colors.shadow ?? "#000",
          },
        ]}
      >
        <Searchbar
          placeholder={t("home.searchPlaceholder", "Search by keyword or bill...")}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[
            styles.searchbar,
            {
              backgroundColor: colors.surfaceContainerLowest ?? theme.colors.surface,
              borderColor: colors.outlineVariant ?? theme.colors.outline,
            },
          ]}
          inputStyle={{ fontSize: 16 }}
          iconColor={theme.colors.primary}
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />
        {SESSION_FILTER_ENABLED && sessionButtons.length > 1 && (
          <SegmentedButtons
            value={sessionFilter}
            onValueChange={setSessionFilter}
            buttons={sessionButtons}
            density="small"
            style={styles.sessionButtons}
          />
        )}
      </View>
      <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>{renderContent()}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    elevation: 1,
  },
  searchbar: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 0,
  },
  sessionButtons: { marginTop: 8 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
});
