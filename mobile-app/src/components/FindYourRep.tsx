// mobile-app/src/components/FindYourRep.tsx (modified)
// Provides address/ZIP lookup for representatives.  Includes optional
// email template fill when a bill prop is provided.

import React, { useMemo, useState } from "react";
import { View, StyleSheet, Linking, Platform, Keyboard } from "react-native";
import {
  Text,
  TextInput,
  Button,
  Card,
  ActivityIndicator,
  useTheme,
  Divider,
} from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useRouter, useSegments } from "expo-router";
import { findYourRep } from "@/lib/find-your-representative";
import { supabase } from "@/lib/supabase";
import { createLegislatorLookupKey, normalizeChamberForLookup } from "@/lib/legislatorLookup";
import { PATHS } from "@/lib/paths";
import type { Bill } from "./Bill";

type Person = {
  id?: string | number;
  name?: string;
  email?: string | null;
  current_role?: {
    org_classification?: "upper" | "lower" | null;
    district?: string | number | null;
    title?: string | null;
  } | null;
  party?: string | null;
  offices?: { email?: string | null }[] | null;
  openstates_url?: string | null;
  _approximate?: boolean;
  _approx_source?: string | null;
  _approx_zip?: string | null;
};

type PersonVoteSummary = {
  vote_choice: string | null;
  vote_result: string | null;
  vote_date: string | null;
  motion: string | null;
};

type PersonWithMatch = Person & {
  lookupKey?: string;
  supabaseId?: number | null;
  latestBillVote?: PersonVoteSummary | null;
  voteAvailability?: "recorded" | "not_eligible" | "no_record";
};

function nameOf(p: Person) {
  return p?.name ?? "—";
}

export default function FindYourRep({ bill }: { bill?: Bill | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const [value, setValue] = useState("");
  const [results, setResults] = useState<PersonWithMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const originTab = useMemo<"bills" | "advocacy">(() => {
    const segmentList = Array.isArray(segments) ? (segments as string[]) : [];
    const primary = segmentList[0];
    const tabKey = segmentList[1];

    if (primary === "(tabs)") {
      if (tabKey === "index") return "bills";
      if (tabKey === "advocacy") return "advocacy";
    }
    if (primary === "bill" || primary === "legislator") {
      return "bills";
    }
    if (primary === "advocacy") {
      return "advocacy";
    }
    if (bill) {
      return "bills";
    }
    return "advocacy";
  }, [bill, segments]);

  const onSearch = async () => {
    setErr(null);
    setInfo(null);
    if (!value.trim()) {
      setErr(t("findYourRep.error.empty", "Please enter an address or ZIP code."));
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await findYourRep(value);
      const people: Person[] = Array.isArray(res) ? (res as Person[]) : [];
      if (!people.length) {
        setErr(t("findYourRep.error.none", "No representatives found for that location."));
        setInfo(null);
      }
      const enriched = await attachSupabaseMatches(people || [], bill);
      const stateOnly = enriched.filter(
        (entry) =>
          typeof entry?.jurisdiction?.classification === "string" &&
          entry.jurisdiction.classification.toLowerCase() === "state",
      );
      setResults(stateOnly);

      const approxZip = stateOnly.find((p: any) => p?._approximate);
      setInfo(
        approxZip
          ? t(
              "findYourRep.approxNotice",
              "Approximate match for ZIP {{zip}}. Refine with a street address for precision.",
              { zip: (approxZip as any)?._approx_zip ?? value.trim() },
            )
          : null,
      );
    } catch (e: any) {
      setErr(e?.message ?? t("findYourRep.error.generic", "Failed to look up representatives."));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const attachSupabaseMatches = async (
    people: Person[],
    activeBill?: Bill | null,
  ): Promise<PersonWithMatch[]> => {
    if (!people.length) return [];

    const lookupEntries = people.map((p) => ({
      lookup: createLegislatorLookupKey(
        p.name,
        p.current_role?.org_classification,
        p.current_role?.district,
      ),
      person: p,
      providerId: typeof p.id === "string" ? p.id : null,
    }));

    const uniqueLookups = Array.from(
      new Set(
        lookupEntries
          .map((entry) => entry.lookup)
          .filter((lookup) => lookup && lookup.replace(/:/g, "").length > 0),
      ),
    );

    const providerIds = Array.from(
      new Set(lookupEntries.map((entry) => entry.providerId).filter((id): id is string => !!id)),
    );

    const lookupMatches = new Map<string, number>();
    const providerMatches = new Map<string, number>();

    if (providerIds.length) {
      const { data: providerRows, error: providerError } = await supabase
        .from("legislators")
        .select("id, provider_person_id")
        .eq("provider", "openstates")
        .in("provider_person_id", providerIds);

      if (providerError) console.error("Failed to match legislators by provider id", providerError);

      providerRows?.forEach((row: { id: number; provider_person_id: string | null }) => {
        if (row.provider_person_id) {
          providerMatches.set(row.provider_person_id, Number(row.id));
        }
      });
    }

    if (uniqueLookups.length) {
      const { data: lookupRows, error: lookupError } = await supabase
        .from("legislators")
        .select("id, lookup_key")
        .in("lookup_key", uniqueLookups);

      if (lookupError) console.error("Failed to match legislators", lookupError);

      lookupRows?.forEach((row: { id: number; lookup_key: string | null }) => {
        if (row.lookup_key) lookupMatches.set(row.lookup_key, Number(row.id));
      });
    }

    const enriched = lookupEntries.map(({ lookup, person, providerId }) => {
      const supabaseId =
        (providerId ? providerMatches.get(providerId) ?? null : null) ??
        (lookup ? lookupMatches.get(lookup) ?? null : null);
      return {
        ...person,
        lookupKey: lookup,
        supabaseId,
      };
    });

    const billId = activeBill?.id ?? null;
    const supabaseIdsForBill = billId
      ? enriched
          .map((entry) => (typeof entry.supabaseId === "number" ? entry.supabaseId : null))
          .filter((id): id is number => id !== null)
      : [];

    const voteSummaries = new Map<number, PersonVoteSummary>();
    const voteEventChambers = new Set<string>();

    if (billId && supabaseIdsForBill.length) {
      const { data: voteRows, error: voteError } = await supabase
        .from("v_rep_vote_history")
        .select("legislator_id,vote_choice,vote_result,vote_date,motion")
        .eq("bill_id", billId)
        .in("legislator_id", supabaseIdsForBill)
        .order("vote_date", { ascending: false });

      if (voteError) {
        console.error("Failed to fetch vote summaries", voteError);
      } else {
        for (const row of voteRows ?? []) {
          const legislatorId = (row as any)?.legislator_id;
          if (typeof legislatorId === "number" && !voteSummaries.has(legislatorId)) {
            voteSummaries.set(legislatorId, {
              vote_choice: (row as any)?.vote_choice ?? null,
              vote_result: (row as any)?.vote_result ?? null,
              vote_date: (row as any)?.vote_date ?? null,
              motion: (row as any)?.motion ?? null,
            });
          }
        }
      }

      const { data: eventRows, error: eventError } = await supabase
        .from("vote_events")
        .select("chamber")
        .eq("bill_id", billId);

      if (eventError) {
        console.error("Failed to fetch vote event chambers", eventError);
      } else {
        for (const row of eventRows ?? []) {
          const chamberRaw = (row as any)?.chamber ?? null;
          const normalized = normalizeChamberForLookup(chamberRaw);
          if (normalized) {
            voteEventChambers.add(normalized);
          }
        }
      }
    }

    return enriched.map((entry) => {
      const normalizedChamber = normalizeChamberForLookup(
        entry?.current_role?.org_classification ?? null,
      );

      let voteAvailability: PersonWithMatch["voteAvailability"] = "no_record";
      let latestBillVote: PersonVoteSummary | null = null;

      if (entry.supabaseId && voteSummaries.has(entry.supabaseId)) {
        voteAvailability = "recorded";
        latestBillVote = voteSummaries.get(entry.supabaseId) ?? null;
      } else if (
        entry.supabaseId &&
        billId &&
        voteEventChambers.size > 0 &&
        normalizedChamber &&
        !voteEventChambers.has(normalizedChamber)
      ) {
        voteAvailability = "not_eligible";
      } else if (entry.supabaseId) {
        voteAvailability = "no_record";
      }

      return {
        ...entry,
        latestBillVote,
        voteAvailability,
      };
    });
  };

  /**
   * Compose an email to a legislator using the i18n templates.  When a
   * `bill` prop is provided we fill in the bill number and title.  The
   * recipient's name is extracted from the person record if possible.
   */
  const composeEmail = (person: Person, toEmail: string) => {
    let subject = "";
    let body = "";
    if (bill) {
      const num = bill.bill_number ?? bill.id ?? "";
      const title = bill.title ?? "";
      const nameParts = (person.name || "").split(" ");
      const lastName = nameParts[nameParts.length - 1] || "";
      subject = t("email.subjectLine", { num, title });
      body = t("email.bodyTemplate", {
        name: lastName,
        num,
        title,
      });
    }
    const url = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.wrap}>
      <Text variant="titleLarge" style={styles.title}>
        {t("findYourRep.title", "Find Your Representatives")}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t("findYourRep.placeholder", "Enter address or ZIP (e.g., 94546)")}
        keyboardType={Platform.OS === "web" ? "default" : "default"}
      />
      <View style={{ height: 12 }} />
      <Button mode="contained" onPress={onSearch} disabled={loading}>
        {loading ? t("findYourRep.searching", "Searching…") : t("common.search", "Search")}
      </Button>
      {!!err && (
        <>
          <View style={{ height: 12 }} />
          <Text style={{ color: theme.colors.error }}>{err}</Text>
        </>
      )}
      {!!info && !loading && !err && (
        <>
          <View style={{ height: 12 }} />
          <Text style={{ color: theme.colors.tertiary, opacity: 0.8 }}>{info}</Text>
        </>
      )}
      <Divider style={{ marginVertical: 16 }} />
      {loading ? (
        <ActivityIndicator />
      ) : (
        results.map((p, idx) => {
          const rawEmail = p?.email || p?.offices?.find((o) => !!o?.email)?.email || null;
          const email = rawEmail && rawEmail.includes("@") ? rawEmail : null;
          const chamberKey = p?.current_role?.org_classification === "upper" ? "upper" : "lower";
          const chamber = t(
            `chamber.${chamberKey}`,
            chamberKey === "upper" ? "Senate" : "Assembly",
          );
          const district = p?.current_role?.district;
          const hasMatch = !!p.supabaseId;
          const fallbackPayload = JSON.stringify({
            openStatesId: typeof p.id === "string" ? p.id : null,
            name: p.name ?? null,
            party: p.party ?? null,
            chamber: p.current_role?.org_classification ?? null,
            title: p.current_role?.title ?? null,
            district: p.current_role?.district ?? null,
            email,
            openstatesUrl: p.openstates_url ?? null,
            contactUrl: !email && rawEmail ? rawEmail : null,
            billContext: bill
              ? {
                  billId: typeof bill.id === "number" ? bill.id : null,
                  billNumber: bill.bill_number ?? null,
                  billTitle: bill.title ?? null,
                }
              : null,
          });
          const voteSummary = p.latestBillVote ?? null;
          const voteAvailability = p.voteAvailability ?? (hasMatch ? "no_record" : undefined);
          const voteDate =
            voteSummary?.vote_date && !Number.isNaN(new Date(voteSummary.vote_date).getTime())
              ? new Date(voteSummary.vote_date).toLocaleDateString()
              : null;
          return (
            <Card key={p.id ?? `${nameOf(p)}-${idx}`} style={{ marginBottom: 12 }} mode="outlined">
              <Card.Title
                title={nameOf(p)}
                subtitle={[
                  p.party,
                  chamber && `(${chamber} Dist. ${district ?? "?"})`,
                  p.current_role?.title,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              />
              {!hasMatch && (
                <Card.Content>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {t(
                      "findYourRep.noRecord",
                      "Voting record not available yet for this representative.",
                    )}
                  </Text>
                </Card.Content>
              )}
              {hasMatch && voteSummary && (
                <Card.Content>
                  <Text variant="bodyMedium" style={{ fontWeight: "600", marginBottom: 4 }}>
                    {t("findYourRep.latestVote", "Latest vote on this bill")}
                  </Text>
                  <Text variant="bodyMedium" style={{ marginBottom: 2 }}>
                    {t("findYourRep.voteChoice", "Choice")}:{" "}
                    {voteSummary.vote_choice
                      ? voteSummary.vote_choice.charAt(0).toUpperCase() +
                        voteSummary.vote_choice.slice(1)
                      : t("findYourRep.choiceUnknown", "Unknown")}
                  </Text>
                  {voteSummary.vote_result ? (
                    <Text variant="bodyMedium" style={{ marginBottom: 2 }}>
                      {t("findYourRep.voteResult", "Outcome")}: {voteSummary.vote_result}
                    </Text>
                  ) : null}
                  {voteDate ? (
                    <Text variant="bodyMedium" style={{ marginBottom: 2 }}>
                      {t("findYourRep.voteDate", "Date")}: {voteDate}
                    </Text>
                  ) : null}
                  {voteSummary.motion ? (
                    <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                      {t("findYourRep.voteMotion", "Motion")}: {voteSummary.motion}
                    </Text>
                  ) : null}
                </Card.Content>
              )}
              {hasMatch && !voteSummary && voteAvailability === "not_eligible" && (
                <Card.Content>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {t(
                      "findYourRep.notEligible",
                      "This bill has not received a vote in this chamber yet.",
                    )}
                  </Text>
                </Card.Content>
              )}
              {hasMatch && !voteSummary && voteAvailability === "no_record" && (
                <Card.Content>
                  <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {t(
                      "findYourRep.noVoteOnBill",
                      "We have not recorded a vote from this legislator on this bill yet.",
                    )}
                  </Text>
                </Card.Content>
              )}
              <Card.Actions>
                {email && (
                  <Button icon="email-outline" onPress={() => composeEmail(p, email)}>
                    {t("common.email", "Email")}
                  </Button>
                )}
                <Button
                  mode="text"
                  disabled={!hasMatch && !p.id}
                  onPress={() => {
                    const baseParams = hasMatch
                      ? { id: String(p.supabaseId), payload: fallbackPayload }
                      : typeof p.id === "string" || typeof p.id === "number"
                        ? { id: "lookup", payload: fallbackPayload }
                        : null;
                    if (baseParams) {
                      const nextParams = {
                        ...baseParams,
                        ...(bill?.id ? { billId: String(bill.id) } : {}),
                      };
                      router.push(PATHS.repProfileIn(originTab, nextParams));
                    }
                  }}
                >
                  {t("findYourRep.viewProfile", "View profile")}
                </Button>
              </Card.Actions>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  title: { marginBottom: 8 },
});
