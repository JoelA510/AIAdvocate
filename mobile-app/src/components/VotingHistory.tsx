// mobile-app/src/components/VotingHistory.tsx
// Displays a legislator's voting history with simple filtering controls.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { ActivityIndicator, Button, Card, Chip, Menu, Text, useTheme } from "react-native-paper";
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

export function getBillOptions(rows: VoteHistoryRow[]): BillOption[] {
  const unique = new Map<number, BillOption>();
  rows.forEach((row) => {
    if (!row.bill_id) return;
    if (unique.has(row.bill_id)) return;
    unique.set(row.bill_id, {
      bill_id: row.bill_id,
      bill_number: row.bill_number ?? null,
      bill_title: row.bill_title ?? null,
    });
  });
  return Array.from(unique.values());
}

export function getFilteredRows(
  rows: VoteHistoryRow[],
  mode: "all" | "closed" | "specific",
  selectedBillId: number | null,
): VoteHistoryRow[] {
  let next = rows;
  if (mode === "closed") {
    next = next.filter((row) => CLOSED_RESULTS.includes((row.vote_result ?? "").toLowerCase()));
  }
  if (mode === "specific" && selectedBillId) {
    next = next.filter((row) => row.bill_id === selectedBillId);
  }
  return next;
}

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
  const [allRows, setAllRows] = useState<VoteHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowsChangeRef = useRef<((rows: VoteHistoryRow[]) => void) | null>(null);
  const billContextChangeRef = useRef<((context: BillContext | null) => void) | null>(null);

  useEffect(() => {
    rowsChangeRef.current = onRowsChange ?? null;
  }, [onRowsChange]);

  useEffect(() => {
    billContextChangeRef.current = onBillContextChange ?? null;
  }, [onBillContextChange]);

  useEffect(() => {
    if (initialMode !== filterMode) {
      setFilterMode(initialMode);
    }
    if (initialBillId !== null) {
      setSelectedBillId(initialBillId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialBillId, legislatorId]);

  const billOptions = useMemo(() => getBillOptions(allRows), [allRows]);

  const filteredRows = useMemo(
    () => getFilteredRows(allRows, filterMode, selectedBillId),
    [allRows, filterMode, selectedBillId],
  );

  useEffect(() => {
    const loadRows = async () => {
      if (!numericLegislatorId) {
        setAllRows([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from("v_rep_vote_history")
          .select(
            "vote_event_id,vote_date,motion,vote_result,vote_choice,bill_id,bill_number,bill_title",
          )
          .eq("legislator_id", numericLegislatorId)
          .order("vote_date", { ascending: false })
          .limit(200);

        if (queryError) throw queryError;
        setAllRows((data ?? []) as VoteHistoryRow[]);
      } catch (err: any) {
        console.error("Failed to load voting history", err);
        setError(err.message ?? "Unable to load voting history.");
        setAllRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadRows();
  }, [numericLegislatorId]);

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

  useEffect(() => {
    if (filterMode !== "specific") return;
    if (!billOptions.length) return;
    if (!selectedBillId || !billOptions.some((option) => option.bill_id === selectedBillId)) {
      setSelectedBillId(billOptions[0].bill_id);
    }
  }, [filterMode, selectedBillId, billOptions]);

  useEffect(() => {
    rowsChangeRef.current?.(filteredRows);
  }, [filteredRows]);

  useEffect(() => {
    if (filterMode === "specific" && selectedBillId) {
      const option =
        billOptions.find((item) => item.bill_id === selectedBillId) ??
        (filteredRows.length
          ? {
              bill_id: filteredRows[0].bill_id ?? selectedBillId,
              bill_number: filteredRows[0].bill_number ?? null,
              bill_title: filteredRows[0].bill_title ?? null,
            }
          : null);
      if (option) {
        billContextChangeRef.current?.({
          billId: option.bill_id,
          billNumber: option.bill_number ?? null,
          billTitle: option.bill_title ?? null,
        });
      } else {
        billContextChangeRef.current?.(null);
      }
    } else {
      billContextChangeRef.current?.(null);
    }
  }, [filteredRows, filterMode, selectedBillId, billOptions]);

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
      ) : filteredRows.length === 0 ? (
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
        <View style={styles.list}>{filteredRows.map(renderRow)}</View>
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
  list: {
    gap: 12,
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
