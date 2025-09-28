// mobile-app/app/legislator/[id].tsx
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Card, Text, Button, ActivityIndicator, Divider } from "react-native-paper";
import { supabase } from "../../src/lib/supabase";
import EmptyState from "../../src/components/EmptyState";

type VoteRow = {
  id?: string | number;
  vote_id?: number | null;
  bill_id?: number;
  bill_number?: string | null;
  bill_title?: string | null;
  bill_slug?: string | null;
  option?: string | null; // yes/no/abstain/absent
  result?: string | null; // passed/failed
  yes_count?: number | null;
  no_count?: number | null;
  other_count?: number | null;
  date?: string | null;
  motion?: string | null;
};

type Legislator = {
  id: string | number;
  name?: string;
  party?: string | null;
  district?: string | number | null;
  chamber?: string | null;
};

const OPTION_LABELS: Record<string, string> = {
  yea: "Yes",
  yay: "Yes",
  yea2: "Yes",
  yea3: "Yes",
  nay: "No",
  nay2: "No",
  nay3: "No",
  aye: "Yes",
  aye2: "Yes",
  aye3: "Yes",
  y: "Yes",
  n: "No",
  abstain: "Abstain",
  present: "Present",
  excused: "Excused",
  absent: "Absent",
  nv: "Present",
  not_voting: "Not voting",
};

const formatOption = (input?: string | null) => {
  if (!input) return "—";
  const key = input.toLowerCase().replace(/\s+/g, "");
  return OPTION_LABELS[key] ?? input;
};

const formatResult = (input?: string | null) => {
  if (!input) return "—";
  const trimmed = input.trim();
  if (!trimmed) return "—";
  return trimmed.replace(/_/g, " ");
};

export default function LegislatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [leg, setLeg] = useState<Legislator | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!id) {
          throw new Error(t("legislator.invalidId", "Missing legislator identifier."));
        }

        const numericId = Number(id);
        if (Number.isNaN(numericId)) {
          throw new Error(t("legislator.invalidId", "Missing legislator identifier."));
        }

        const { data: legislatorData, error: legislatorError } = await supabase
          .from("legislators")
          .select("id,name,party,district,chamber")
          .eq("id", numericId)
          .maybeSingle();
        if (legislatorError) throw legislatorError;
        if (!legislatorData) {
          throw new Error(t("legislator.missing", "We do not have that legislator on file yet."));
        }
        if (isMounted) setLeg(legislatorData as Legislator);

        const { data: rawVotes, error: votesError } = await supabase
          .from("votes")
          .select("id,vote_id,bill_id,option,result,yes_count,no_count,other_count,date,motion")
          .eq("legislator_id", numericId)
          .order("date", { ascending: false })
          .limit(100);
        if (votesError) throw votesError;

        let rows: VoteRow[] = (rawVotes as VoteRow[]) ?? [];

        if (rows.length) {
          const billIds = Array.from(
            new Set(rows.map((r) => r.bill_id).filter(Boolean)),
          ) as number[];
          if (billIds.length) {
            const { data: billData, error: billsError } = await supabase
              .from("bills")
              .select("id,bill_number,title,slug")
              .in("id", billIds);
            if (!billsError && billData) {
              const billsMap = new Map<
                number,
                { bill_number?: string; title?: string; slug?: string }
              >();
              billData.forEach((bill: any) => {
                billsMap.set(Number(bill.id), bill);
              });
              rows = rows.map((vote) => {
                const bill = vote.bill_id ? billsMap.get(Number(vote.bill_id)) : null;
                return {
                  ...vote,
                  bill_number: vote.bill_number ?? bill?.bill_number ?? null,
                  bill_title: vote.bill_title ?? bill?.title ?? null,
                  bill_slug: vote.bill_slug ?? bill?.slug ?? null,
                };
              });
            }
          }
        }

        if (isMounted) setVotes(rows);
      } catch (err: any) {
        if (isMounted) {
          setVotes([]);
          setLeg(null);
          setError(err?.message ?? t("legislator.loadError", "Unable to load that legislator."));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [id, t]);

  const header = useMemo(() => {
    const parts = [];
    if (leg?.name) parts.push(leg.name);
    if (leg?.party) parts.push(leg.party);
    if (leg?.district) parts.push(`${t("legislator.district", "District")} ${leg.district}`);
    if (leg?.chamber) parts.push(leg.chamber);
    return parts.join(" • ");
  }, [leg, t]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: t("legislator.votingRecord", "Voting Record") }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Stack.Screen options={{ title: t("legislator.votingRecord", "Voting Record") }} />
        <EmptyState
          icon="person.crop.circle.badge.exclamationmark"
          title={t("legislator.votingRecord", "Voting Record")}
          message={error}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Stack.Screen
        options={{ title: leg?.name || t("legislator.votingRecord", "Voting Record") }}
      />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text variant="titleLarge" style={{ marginBottom: 12 }}>
          {header || t("legislator.votingRecord", "Voting Record")}
        </Text>

        {!votes.length ? (
          <EmptyState
            icon="person.crop.circle.badge.questionmark"
            title={t("legislator.votingRecord", "Voting Record")}
            message={t(
              "legislator.noVotes",
              "We have not recorded any votes for this legislator yet.",
            )}
          />
        ) : (
          votes.map((v) => (
            <Card key={String(v.id)} style={{ marginBottom: 12 }} mode="outlined">
              <Card.Title
                title={`${v.bill_number ?? v.bill_slug ?? v.bill_id ?? "—"}`}
                subtitle={v.bill_title ?? ""}
              />
              <Card.Content>
                <Text>
                  {t("legislator.vote", "Vote: {{option}}", { option: formatOption(v.option) })}
                </Text>
                <Text>
                  {t("legislator.result", "Result: {{result}}", { result: formatResult(v.result) })}
                </Text>
                {v.motion && (
                  <Text style={{ marginTop: 4, opacity: 0.8 }}>
                    {t("legislator.motion", "Motion: {{motion}}", { motion: v.motion })}
                  </Text>
                )}
                <Divider style={{ marginVertical: 8 }} />
                <Text>{`Yes: ${v.yes_count ?? 0} • No: ${v.no_count ?? 0} • Other: ${v.other_count ?? 0}`}</Text>
                {v.date && (
                  <Text style={{ opacity: 0.6, marginTop: 6 }}>
                    {new Date(v.date).toLocaleString()}
                  </Text>
                )}
              </Card.Content>
              <Card.Actions>
                <Button
                  mode="text"
                  disabled={!v.bill_id}
                  onPress={() => {
                    if (v.bill_id) {
                      router.push({ pathname: "/bill/[id]", params: { id: String(v.bill_id) } });
                    }
                  }}
                >
                  {t("legislator.openBill", "Open bill")}
                </Button>
              </Card.Actions>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
