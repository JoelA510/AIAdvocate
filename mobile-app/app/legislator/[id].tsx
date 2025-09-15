// mobile-app/app/legislator/[id].tsx
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme, Card, Text, Button, ActivityIndicator, Divider } from "react-native-paper";
import { supabase } from "../../src/lib/supabase";
import EmptyState from "../../src/components/EmptyState";

type VoteRow = {
  id?: string | number;
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
};

type Legislator = {
  id: string | number;
  name?: string;
  party?: string | null;
  district?: string | number | null;
};

export default function LegislatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useTranslation();

  const [leg, setLeg] = useState<Legislator | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // Try a straightforward legislator lookup
        const L = await supabase.from("legislators").select("*").eq("id", id).maybeSingle();
        if (!L.error && L.data) setLeg(L.data as any);

        // Try a few possible vote table shapes
        let rows: VoteRow[] = [];

        // A) votes table with joins flattened by a view
        const A = await supabase
          .from("votes_view")
          .select("*")
          .eq("legislator_id", id)
          .order("date", { ascending: false })
          .limit(100);
        if (!A.error && A.data?.length) rows = A.data as any[];

        // B) votes table + bills join manually
        if (!rows.length) {
          const V = await supabase
            .from("votes")
            .select("id,bill_id,option,result,yes_count,no_count,other_count,date")
            .eq("legislator_id", id)
            .order("date", { ascending: false })
            .limit(100);
          if (!V.error && V.data?.length) {
            const ids = (V.data as any[]).map((r) => r.bill_id).filter(Boolean);
            let billsMap = new Map<string, any>();
            if (ids.length) {
              const B = await supabase
                .from("bills")
                .select("id,bill_number,title,slug")
                .in("id", ids);
              if (!B.error && B.data) {
                billsMap = new Map(B.data.map((b: any) => [String(b.id), b]));
              }
            }
            rows = (V.data as any[]).map((r) => {
              const b = billsMap.get(String(r.bill_id));
              return {
                id: r.id,
                bill_id: r.bill_id,
                bill_number: b?.bill_number,
                bill_title: b?.title,
                bill_slug: b?.slug,
                option: r.option,
                result: r.result,
                yes_count: r.yes_count,
                no_count: r.no_count,
                other_count: r.other_count,
                date: r.date,
              } as VoteRow;
            });
          }
        }

        // C) roll_calls by legislator_id (another common shape)
        if (!rows.length) {
          const R = await supabase
            .from("roll_calls")
            .select("id,bill_id,option,result,yes_count,no_count,other_count,date,legislator_id")
            .eq("legislator_id", id)
            .order("date", { ascending: false })
            .limit(100);
          if (!R.error && R.data?.length) {
            const ids = (R.data as any[]).map((r) => r.bill_id).filter(Boolean);
            let billsMap = new Map<string, any>();
            if (ids.length) {
              const B = await supabase
                .from("bills")
                .select("id,bill_number,title,slug")
                .in("id", ids);
              if (!B.error && B.data) {
                billsMap = new Map(B.data.map((b: any) => [String(b.id), b]));
              }
            }
            rows = (R.data as any[]).map((r) => {
              const b = billsMap.get(String(r.bill_id));
              return {
                id: r.id,
                bill_id: r.bill_id,
                bill_number: b?.bill_number,
                bill_title: b?.title,
                bill_slug: b?.slug,
                option: r.option,
                result: r.result,
                yes_count: r.yes_count,
                no_count: r.no_count,
                other_count: r.other_count,
                date: r.date,
              } as VoteRow;
            });
          }
        }

        if (isMounted) setVotes(rows);
      } catch {
        if (isMounted) setVotes([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const header = useMemo(() => {
    const parts = [];
    if (leg?.name) parts.push(leg.name);
    if (leg?.party) parts.push(leg.party);
    if (leg?.district) parts.push(`${t("legislator.district", "District")} ${leg.district}`);
    return parts.join(" • ");
  }, [leg, t]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator />
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
            message={t("relatedBills.error", "Could not load related bills.")}
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
                  {t("legislator.vote", "Vote: {{option}}", { option: String(v.option ?? "—") })}
                </Text>
                <Text>{`${t("legislator.votingRecord", "Voting Record")}: ${String(v.result ?? "—")}`}</Text>
                <Divider style={{ marginVertical: 8 }} />
                <Text>{`Yes: ${v.yes_count ?? 0} • No: ${v.no_count ?? 0} • Other: ${v.other_count ?? 0}`}</Text>
                {v.date && (
                  <Text style={{ opacity: 0.6, marginTop: 6 }}>
                    {new Date(v.date).toLocaleString()}
                  </Text>
                )}
              </Card.Content>
              <Card.Actions>
                <Button mode="text" onPress={() => router.push(`/bill/${v.bill_id}`)}>
                  {t("tabs.bills", "Bills")}
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
