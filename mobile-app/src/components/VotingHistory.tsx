// mobile-app/src/components/VotingHistory.tsx
// Displays a legislator's voting history with simple filtering controls.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Menu,
  Text,
  useTheme,
} from "react-native-paper";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";

export type FilterMode = "all" | "closed" | { billId: string };

type VotingHistoryProps = {
  legislatorId: string;
  initialFilter?: FilterMode;
  onRowsChange?: (rows: VoteHistoryRow[]) => void;
  onBillContextChange?: (context: BillContext | null) => void;
};

type VoteHistoryRow = {
  vote_event_id: string | number;
  vote_date: string | null;
  motion: string | null;
  vote_result: string | null;
  vote_choice: string;
  bill_id: number | null;
  bill_number: string | null;
  bill_title: string | null;
};

type BillOption = {
  bill_id: number;
  bill_number: string | null;
  bill_title: string | null;
};

export type BillContext = {
  billId: number;
  billNumber: string | null;
  billTitle: string | null;
};

const CLOSED_RESULTS = ["passed", "failed"];

export default function VotingHistory({
  legislatorId,
  initialFilter,
  onRowsChange,
  onBillContextChange,
}: VotingHistoryProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const numericLegislatorId = useMemo(() => {
    const parsed = Number(legislatorId);
    return Number.isNaN(parsed) ? null : parsed;
  }, [legislatorId]);

  const initialMode = useMemo<"all" | "closed" | "specific">(() => {
    if (!initialFilter) return "all";
    if (initialFilter === "all" || initialFilter === "closed") return initialFilter;
    if (typeof initialFilter === "object" && initialFilter.billId) return "specific";
    return "all";
  }, [initialFilter]);

  const initialBillId = useMemo<number | null>(() => {
    if (!initialFilter || typeof initialFilter !== "object") return null;
    const parsed = Number(initialFilter.billId);
    return Number.isNaN(parsed) ? null : parsed;
  }, [initialFilter]);

  const [filterMode, setFilterMode] = useState<"all" | "closed" | "specific">(initialMode);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(initialBillId);
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [billMenuVisible, setBillMenuVisible] = useState(false);
  const [billOptions, setBillOptions] = useState<BillOption[]>([]);
  const [rows, setRows] = useState<VoteHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode !== filterMode) {
      setFilterMode(initialMode);
    }
    if (initialBillId !== null) {
      setSelectedBillId(initialBillId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialBillId, legislatorId]);

  const fetchBillOptions = useCallback(async () => {
    if (!numericLegislatorId) return;
    try {
      const { data, error: billError } = await supabase
        .from("v_rep_vote_history")
        .select("bill_id,bill_number,bill_title,vote_date")
        .eq("legislator_id", numericLegislatorId)
        .not("bill_id", "is", null)
        .order("vote_date", { ascending: false })
        .limit(200);

      if (billError) throw billError;

      const unique: BillOption[] = [];
      const seen = new Set<number>();
      (data ?? []).forEach((row) => {
        if (row.bill_id && !seen.has(row.bill_id)) {
          seen.add(row.bill_id);
          unique.push({
            bill_id: row.bill_id,
            bill_number: row.bill_number ?? null,
            bill_title: row.bill_title ?? null,
          });
        }
      });
      setBillOptions(unique);
    } catch (err: any) {
      console.error("Failed to load bill options", err);
    }
  }, [numericLegislatorId]);

  useEffect(() => {
    let isMounted = true;
    fetchBillOptions();
    return () => {
      isMounted = false;
    };
  }, [fetchBillOptions]);

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      if (!numericLegislatorId) {
        setRows([]);
        setLoading(false);
        onRowsChange?.([]);
        onBillContextChange?.(null);
        return;
      }

      if (filterMode === "specific" && !selectedBillId) {
        setRows([]);
        setLoading(false);
        onRowsChange?.([]);
        onBillContextChange?.(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("v_rep_vote_history")
          .select(
            "vote_event_id,vote_date,motion,vote_result,vote_choice,bill_id,bill_number,bill_title",
          )
          .eq("legislator_id", numericLegislatorId)
          .order("vote_date", { ascending: false })
          .limit(100);

        if (filterMode === "closed") {
          query = query.in("vote_result", CLOSED_RESULTS);
        }
        if (filterMode === "specific" && selectedBillId) {
          query = query.eq("bill_id", selectedBillId);
        }

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        if (!isMounted) return;

        const nextRows = (data ?? []) as VoteHistoryRow[];
        setRows(nextRows);
        onRowsChange?.(nextRows);

        if (filterMode === "specific" && selectedBillId) {
          const option =
            billOptions.find((item) => item.bill_id === selectedBillId) ??
            (nextRows.length
              ? {
                  bill_id: nextRows[0].bill_id ?? selectedBillId,
                  bill_number: nextRows[0].bill_number ?? null,
                  bill_title: nextRows[0].bill_title ?? null,
                }
              : null);
          if (option) {
            onBillContextChange?.({
              billId: option.bill_id,
              billNumber: option.bill_number ?? null,
              billTitle: option.bill_title ?? null,
            });
          } else {
            onBillContextChange?.(null);
          }
        } else {
          onBillContextChange?.(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Failed to load voting history", err);
        setError(err.message ?? "Unable to load voting history.");
        setRows([]);
        onRowsChange?.([]);
        onBillContextChange?.(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRows();
    return () => {
      isMounted = false;
    };
  }, [
    filterMode,
    numericLegislatorId,
    onRowsChange,
    onBillContextChange,
    selectedBillId,
    billOptions,
  ]);

  const currentFilterLabel = useMemo(() => {
    if (filterMode === "all") {
      return t("votingHistory.filter.all", "All bills");
    }
    if (filterMode === "closed") {
      return t("votingHistory.filter.closed", "Closed bills (passed/rejected)");
    }
    return t("votingHistory.filter.specific", "Specific bill");
  }, [filterMode, t]);

  const selectedBillLabel = useMemo(() => {
    if (!selectedBillId) {
      return t("votingHistory.filter.pickBill", "Select bill");
    }
    const option = billOptions.find((item) => item.bill_id === selectedBillId);
    if (!option) return t("votingHistory.filter.pickBill", "Select bill");
    const number = option.bill_number ?? `#${option.bill_id}`;
    const title = option.bill_title ?? "";
    return `${number}${title ? ` — ${title}` : ""}`;
  }, [selectedBillId, billOptions, t]);

  const handleFilterChange = (mode: "all" | "closed" | "specific") => {
    setFilterMenuVisible(false);
    setFilterMode(mode);
    if (mode !== "specific") {
      setSelectedBillId(null);
    } else if (!selectedBillId && billOptions.length > 0) {
      setSelectedBillId(billOptions[0].bill_id);
    }
  };

  const renderRow = (row: VoteHistoryRow) => {
    const dateDisplay = row.vote_date
      ? (() => {
          const parsed = new Date(row.vote_date);
          return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
        })()
      : null;
    const choiceLabel = row.vote_choice
      ? row.vote_choice.charAt(0).toUpperCase() + row.vote_choice.slice(1)
      : t("votingHistory.choiceUnknown", "Unknown");
    return (
      <Card key={String(row.vote_event_id)} style={styles.card} mode="outlined">
        <Card.Title
          title={`${row.bill_number ?? `Bill ${row.bill_id ?? "—"}`} ${
            dateDisplay ? `• ${dateDisplay}` : ""
          }`}
          subtitle={row.bill_title ?? t("votingHistory.noTitle", "No title available")}
        />
        <Card.Content style={styles.cardContent}>
          {row.motion ? (
            <Text style={styles.motionText}>
              {t("votingHistory.motion", "Motion")}: {row.motion}
            </Text>
          ) : null}
          <View style={styles.chipRow}>
            <Chip style={styles.choiceChip} compact>
              {t("votingHistory.choiceLabel", "Choice")}: {choiceLabel}
            </Chip>
            {row.vote_result ? (
              <Chip style={styles.resultChip} compact>
                {t("votingHistory.result", "Result")}: {row.vote_result}
              </Chip>
            ) : null}
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (!numericLegislatorId) {
    return (
      <View style={styles.placeholder}>
        <Text>{t("votingHistory.invalidId", "Voting history unavailable for this member.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <Menu
          visible={filterMenuVisible}
          onDismiss={() => setFilterMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              onPress={() => setFilterMenuVisible(true)}
              style={styles.filterButton}
              textColor={theme.colors.primary}
            >
              {currentFilterLabel}
            </Button>
          }
        >
          <Menu.Item
            title={t("votingHistory.filter.all", "All bills")}
            onPress={() => handleFilterChange("all")}
          />
          <Menu.Item
            title={t("votingHistory.filter.closed", "Closed bills (passed/rejected)")}
            onPress={() => handleFilterChange("closed")}
          />
          <Menu.Item
            title={t("votingHistory.filter.specific", "Specific bill")}
            onPress={() => handleFilterChange("specific")}
          />
        </Menu>

        {filterMode === "specific" && (
          <Menu
            visible={billMenuVisible}
            onDismiss={() => setBillMenuVisible(false)}
            anchor={
              <Button
                mode="contained-tonal"
                onPress={() => setBillMenuVisible(true)}
                style={styles.filterButton}
              >
                {selectedBillLabel}
              </Button>
            }
          >
            {billOptions.length === 0 ? (
              <Menu.Item
                disabled
                title={t("votingHistory.filter.noBills", "No bills on record yet.")}
              />
            ) : (
              billOptions.map((option) => (
                <Menu.Item
                  key={String(option.bill_id)}
                  title={`${option.bill_number ?? `#${option.bill_id}`} ${
                    option.bill_title ? `— ${option.bill_title}` : ""
                  }`}
                  onPress={() => {
                    setSelectedBillId(option.bill_id);
                    setBillMenuVisible(false);
                  }}
                />
              ))
            )}
          </Menu>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text style={{ color: theme.colors.error }}>{error}</Text>
          </Card.Content>
        </Card>
      ) : rows.length === 0 ? (
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text>
              {filterMode === "specific"
                ? t(
                    "votingHistory.noneForBill",
                    "No recorded votes for this legislator on the selected bill yet.",
                  )
                : t(
                    "votingHistory.none",
                    "We have not recorded any votes for this legislator yet.",
                  )}
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          {rows.map(renderRow)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  filterButton: {
    borderRadius: 20,
  },
  loading: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginBottom: 12,
  },
  cardContent: {
    gap: 8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  choiceChip: {
    borderRadius: 14,
  },
  resultChip: {
    borderRadius: 14,
  },
  motionText: {
    opacity: 0.8,
  },
  placeholder: {
    paddingVertical: 16,
    alignItems: "flex-start",
  },
});
