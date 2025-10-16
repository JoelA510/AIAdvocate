import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar, SegmentedButtons, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter, usePathname } from "expo-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import BillComponent, { type Bill } from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { supabase } from "../../src/lib/supabase";
import { fetchTranslationsForBills } from "../../src/lib/translation";

const SESSION_FILTER_ENABLED = false; // Set to true once the 2027-2028 cycle should be exposed to users.
const SESSION_ALL = "all";
const MAX_Q_LEN = 200;

const normalizeQuery = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_Q_LEN);

function extractQueryFromParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.length > 0);
    return first ? first.slice(0, MAX_Q_LEN) : "";
  }
  return typeof value === "string" ? value.slice(0, MAX_Q_LEN) : "";
}

const extractSessionLabel = (
  stateLink: Bill["state_link"] | null | undefined,
): string | null => {
  if (!stateLink) return null;
  const match = stateLink.match(/bill_id=(\d{4})(\d{4})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
};

const buildOrIlikeFilter = (fields: string[], raw: string): string => {
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

const sortBills = (items: Bill[] | null | undefined): Bill[] => {
  const toRank = (value: Bill["rank"]): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const toTime = (value: string | null | undefined): number => {
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
  const router = useRouter();
  const pathname = usePathname();
  const { q: rawQueryParam } = useLocalSearchParams<{ q?: string | string[] }>();
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    extractQueryFromParam(rawQueryParam),
  );
  const normalizedQuery = useMemo(() => normalizeQuery(searchQuery), [searchQuery]);
  const [sessionFilter, setSessionFilter] = useState<string>(SESSION_ALL);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<number, any>>({});
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const listRef = useRef<FlatList<Bill>>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const nextQuery = extractQueryFromParam(rawQueryParam);
    setSearchQuery((prev) => (prev === nextQuery ? prev : nextQuery));
  }, [rawQueryParam]);

  const handleSearchChange = useCallback(
    (text: string) => {
      const next = text.slice(0, MAX_Q_LEN);
      setSearchQuery(next);
      startTransition(() => {
        router.replace({ pathname, params: { q: next || undefined } });
      });
    },
    [pathname, router, startTransition],
  );

  const handleClearQuery = useCallback(() => {
    setSearchQuery("");
    startTransition(() => {
      router.replace({ pathname, params: { q: undefined } });
    });
  }, [pathname, router, startTransition]);

  const { data, isLoading, isFetching, error } = useQuery<Bill[], Error, Bill[]>({
    queryKey: ["bills", { q: normalizedQuery }],
    queryFn: async (): Promise<Bill[]> => {
      const query = normalizedQuery;
      const billNumberRegex = /^[A-Za-z]{2,3}\s*\d+$/;
      let data: Bill[] = [];

      if (!query) {
        const { data: d, error: e } = await supabase
          .from("bills")
          .select("*")
          .order("is_curated", { ascending: false })
          .order("status_date", { ascending: false })
          .order("id", { ascending: false });
        if (e) throw e;
        data = d ?? [];
      } else if (billNumberRegex.test(query)) {
        const processed = query.replace(/\s/g, "");
        const { data: d, error: e } = await supabase
          .from("bills")
          .select("*")
          .ilike("bill_number", `%${processed}%`)
          .order("is_curated", { ascending: false })
          .order("status_date", { ascending: false })
          .order("id", { ascending: false });
        if (e) throw e;
        data = d ?? [];
      } else {
        const { data: d, error: e } = await supabase.rpc("search_bills", {
          p_query: query,
        });
        if (!e) {
          data = d ?? [];
        } else if (
          e.code === "42883" ||
          /function public\.search_bills/i.test(e.message ?? "") ||
          /schema cache/i.test(e.message ?? "") ||
          /column .*search/i.test(e.message ?? "")
        ) {
          const orFilter = buildOrIlikeFilter(["bill_number", "title", "description"], query);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("bills")
            .select("*")
            .or(orFilter)
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false });
          if (fallbackError) throw fallbackError;
          data = fallbackData ?? [];
        } else {
          throw e;
        }
      }

      return data ?? [];
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const fetchedBills: Bill[] = data ?? [];

  useEffect(() => {
    if (error) {
      console.warn("Bills query failed:", error);
    }
  }, [error]);

  const sortedBills = useMemo<Bill[]>(() => sortBills(fetchedBills), [fetchedBills]);

  useEffect(() => {
    const sessionSet = new Set<string>();
    sortedBills.forEach((item) => {
      const session = extractSessionLabel(item?.state_link);
      if (session) sessionSet.add(session);
    });
    const nextSessions = Array.from(sessionSet).sort((a, b) => b.localeCompare(a));
    setAvailableSessions((prev) => {
      if (
        prev.length === nextSessions.length &&
        prev.every((value, index) => value === nextSessions[index])
      ) {
        return prev;
      }
      return nextSessions;
    });
  }, [sortedBills]);

  const ids = useMemo(() => sortedBills.map((b) => b.id), [sortedBills]);
  const idsKey = useMemo(() => ids.join(","), [ids]);

  useEffect(() => {
    if (i18n.language === "en") {
      setTranslations({});
      return;
    }
    if (!ids.length) {
      setTranslations({});
      return;
    }

    let alive = true;
    (async () => {
      try {
        const map = await fetchTranslationsForBills(ids, i18n.language);
        if (!alive) return;

        setTranslations(map);
      } catch (err) {
        if (!alive) return;
        console.warn("Failed to fetch translations:", err);
      }
    })();

    return () => {
      alive = false;
    };
  }, [i18n.language, idsKey, ids]);

  const translatedBills = useMemo<Bill[]>(() => {
    if (i18n.language === "en") return sortedBills;
    if (!Object.keys(translations).length) return sortedBills;

    return sortedBills.map((bill) => {
      const tr = translations[bill.id];
      if (!tr) return bill;
      return {
        ...bill,
        title: tr.title ?? bill.title,
        description: tr.description ?? bill.description,
        summary_simple_es: tr.summary_simple ?? (bill as any).summary_simple_es,
        summary_medium_es: tr.summary_medium ?? (bill as any).summary_medium_es,
        summary_complex_es: tr.summary_complex ?? (bill as any).summary_complex_es,
        original_text_es: tr.original_text ?? (bill as any).original_text_es,
      };
    });
  }, [i18n.language, sortedBills, translations]);

  const filteredBills = useMemo<Bill[]>(() => {
    if (sessionFilter === SESSION_ALL) return translatedBills;
    return translatedBills.filter(
      (item) => extractSessionLabel(item?.state_link) === sessionFilter,
    );
  }, [sessionFilter, translatedBills]);

  const queryError = useMemo(() => {
    if (!error) return null;
    if (error instanceof Error) return error.message;
    return (error as any)?.message ?? String(error);
  }, [error]);

  const isInitialLoading = isLoading && fetchedBills.length === 0;
  const isRefreshing = isFetching && !isInitialLoading;

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
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [normalizedQuery, sessionFilter]);

  const renderContent = () => {
    if (isInitialLoading) {
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
    if (queryError) {
      return (
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={t("error.title", "An Error Occurred")}
          message={t(
            "home.error",
            `We couldn't fetch the bills. Please try again later. \n(${queryError})`,
          )}
        />
      );
    }
    if (filteredBills.length === 0) {
      return (
        <EmptyState
          icon="file-search-outline"
          title={t("home.emptyTitle", "No Bills Found")}
          message={
            normalizedQuery
              ? t(
                  "home.emptyWithQuery",
                  `We couldn't find any bills matching "${normalizedQuery}". Try another search.`,
                )
              : t("home.emptyNoQuery", "There are no bills to display at the moment.")
          }
        />
      );
    }
    return (
      <FlatList
        ref={listRef}
        data={filteredBills}
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
          onChangeText={handleSearchChange}
          value={searchQuery}
          onClearIconPress={handleClearQuery}
          loading={isRefreshing}
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
