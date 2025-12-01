import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar, SegmentedButtons, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter, usePathname, type Href } from "expo-router";
import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";

import BillComponent, { type Bill } from "@/components/Bill";
import BillSkeleton from "@/components/BillSkeleton";
import EmptyState from "@/components/EmptyState";
import { fetchTranslationsForBills } from "@/lib/translation";
import { supabase } from "@/lib/supabase";
import { ThemedView } from "../../components/ThemedView";

const SESSION_FILTER_ENABLED = false; // Flip once the next legislative cycle should be exposed to users.
const SESSION_ALL = "all";
const MAX_Q_LEN = 200;

const normalizeQuery = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, MAX_Q_LEN);

const extractQueryFromParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.length > 0);
    return first ? first.slice(0, MAX_Q_LEN) : "";
  }
  return typeof value === "string" ? value.slice(0, MAX_Q_LEN) : "";
};

const extractSessionLabel = (stateLink: Bill["state_link"] | null | undefined): string | null => {
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

type BillsQueryKey = readonly ["bills", { readonly q: string }];
type BillsQueryOptions = UseQueryOptions<Bill[], Error, Bill[], BillsQueryKey> & {
  onError: (err: Error) => void;
};
type TranslationPatch = Partial<
  Pick<
    Bill,
    | "title"
    | "description"
    | "summary_simple"
    | "summary_medium"
    | "summary_complex"
    | "original_text"
  >
> & {
  summary_simple_es?: string | null;
  summary_medium_es?: string | null;
  summary_complex_es?: string | null;
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
  const [translations, setTranslations] = useState<Record<number, TranslationPatch>>({});
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const listRef = useRef<FlatList<Bill>>(null);
  const [, startTransition] = useTransition();

  // Debounce the URL update to avoid focus loss and re-renders while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== extractQueryFromParam(rawQueryParam)) {
        startTransition(() => {
          router.replace({
            pathname,
            params: { q: searchQuery || undefined },
          } as Href);
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, pathname, router, rawQueryParam]);

  // Sync from URL only if significantly different (e.g. back button)
  // and not just a normalized version of what we already have.
  useEffect(() => {
    const paramQ = extractQueryFromParam(rawQueryParam);
    if (paramQ !== searchQuery) {
      // Avoid overwriting user input with normalized version if they are effectively the same
      // But if the user navigates back, we want to update.
      // Simple heuristic: if the param is a prefix of the current query, don't update (user is typing)
      // But here we rely on the debounce above to prevent the URL from updating prematurely.
      // So if we receive a new param, it's likely from navigation.
      // However, the debounce updates the URL to `searchQuery`.
      // So `paramQ` will eventually become `searchQuery`.
      // The issue is if `paramQ` is normalized (trimmed) and `searchQuery` has a space.
      // We changed the router.replace to use `searchQuery` (raw), so the URL should preserve spaces.
      setSearchQuery(paramQ);
    }
  }, [rawQueryParam]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
    },
    [],
  );

  const handleClearQuery = useCallback(() => {
    setSearchQuery("");
    // Immediate clear for X button
    startTransition(() => {
      router.replace({ pathname, params: { q: undefined } } as Href);
    });
  }, [pathname, router, startTransition]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [normalizedQuery, sessionFilter]);

  const queryKey = useMemo<BillsQueryKey>(
    () => ["bills", { q: normalizedQuery }] as const,
    [normalizedQuery],
  );

  const queryOptions = useMemo<BillsQueryOptions>(
    () => ({
      queryKey,
      queryFn: async (): Promise<Bill[]> => {
        const query = normalizedQuery;
        const billNumberRegex = /^[A-Za-z]{2,3}\s*\d+$/;

        if (!query) {
          const { data: rows, error: queryError } = await supabase
            .from("bills")
            .select("*")
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (queryError) throw queryError;
          return rows ?? [];
        }

        if (billNumberRegex.test(query)) {
          const processed = query.replace(/\s/g, "");
          const { data: rows, error: queryError } = await supabase
            .from("bills")
            .select("*")
            .ilike("bill_number", `%${processed}%`)
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (queryError) throw queryError;
          return rows ?? [];
        }

        const { data: rpcData, error: rpcError } = await supabase.rpc("search_bills", {
          p_query: query,
        });
        if (!rpcError) {
          return (rpcData ?? []) as Bill[];
        }

        if (
          rpcError.code === "42883" ||
          /function public\.search_bills/i.test(rpcError.message ?? "") ||
          /schema cache/i.test(rpcError.message ?? "") ||
          /column .*search/i.test(rpcError.message ?? "")
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
          return fallbackData ?? [];
        }

        throw rpcError;
      },
      placeholderData: keepPreviousData,
      staleTime: 15_000,
      onError: (err: Error) => console.warn("Bills query failed:", err),
    }),
    [normalizedQuery, queryKey],
  );

  const { data, isPending, isFetching, isError, error } = useQuery(queryOptions);

  const fetchedBills = useMemo<Bill[]>(() => (Array.isArray(data) ? data : []), [data]);
  const isInitialLoading = isPending && fetchedBills.length === 0;
  const isRefreshing = isFetching && !isInitialLoading;
  const errorMessage = isError ? (error instanceof Error ? error.message : String(error)) : null;

  useEffect(() => {
    const sessionSet = new Set<string>();
    fetchedBills.forEach((item) => {
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
  }, [fetchedBills]);

  const filteredBills = useMemo(() => {
    if (sessionFilter === SESSION_ALL) {
      return fetchedBills;
    }
    return fetchedBills.filter((item) => extractSessionLabel(item?.state_link) === sessionFilter);
  }, [fetchedBills, sessionFilter]);

  const sortedBills = useMemo(() => sortBills(filteredBills), [filteredBills]);
  const ids = useMemo(() => sortedBills.map((bill) => bill.id), [sortedBills]);
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
        if (!map || !Object.keys(map).length) {
          setTranslations({});
          return;
        }
        const next: Record<number, TranslationPatch> = {};
        Object.entries(map).forEach(([key, value]) => {
          const id = Number(key);
          if (Number.isNaN(id) || !value) return;
          next[id] = {
            title: value.title ?? undefined,
            description: value.description ?? null,
            summary_simple: value.summary_simple ?? null,
            summary_medium: value.summary_medium ?? null,
            summary_complex: value.summary_complex ?? null,
            original_text: value.original_text ?? null,
            summary_simple_es: value.summary_simple ?? null,
            summary_medium_es: value.summary_medium ?? null,
            summary_complex_es: value.summary_complex ?? null,
          };
        });
        setTranslations(next);
      } catch {
        if (alive) {
          setTranslations({});
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [i18n.language, idsKey, ids]);

  useEffect(() => {
    if (sessionFilter !== SESSION_ALL && !availableSessions.includes(sessionFilter)) {
      setSessionFilter(SESSION_ALL);
    }
  }, [availableSessions, sessionFilter]);

  const sessionOptions = useMemo<string[]>(() => {
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

  const displayBills = useMemo<Bill[]>(() => {
    if (!Object.keys(translations).length) {
      return sortedBills;
    }
    return sortedBills.map((bill) => {
      const tr = translations[bill.id];
      if (!tr) return bill;
      return {
        ...bill,
        title: tr.title ?? bill.title,
        description: tr.description ?? bill.description,
        summary_simple: tr.summary_simple ?? bill.summary_simple,
        summary_medium: tr.summary_medium ?? bill.summary_medium,
        summary_complex: tr.summary_complex ?? bill.summary_complex,
        original_text: tr.original_text ?? bill.original_text,
        summary_simple_es: tr.summary_simple_es ?? bill.summary_simple_es,
        summary_medium_es: tr.summary_medium_es ?? bill.summary_medium_es,
        summary_complex_es: tr.summary_complex_es ?? bill.summary_complex_es,
      };
    });
  }, [sortedBills, translations]);

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
    if (errorMessage) {
      return (
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={t("error.title", "An Error Occurred")}
          message={t(
            "home.error",
            `We couldn't fetch the bills. Please try again later. \n(${errorMessage})`,
          )}
        />
      );
    }
    if (!isFetching && displayBills.length === 0) {
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
        data={displayBills}
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
            borderRadius: theme.roundness * 6,
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
    // borderRadius will be applied via style prop to access theme
    borderWidth: 1,
    gap: 8,
    elevation: 1,
  },
  searchbar: {
    elevation: 0,
  },
  sessionButtons: { marginTop: 8 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
});
