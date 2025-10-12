// mobile-app/app/legislator/[id].tsx
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Card, Text, Button, ActivityIndicator } from "react-native-paper";
import { supabase } from "../../src/lib/supabase";
import EmptyState from "../../src/components/EmptyState";
import { IconSymbol } from "../../components/ui/IconSymbol";
import VotingHistory, {
  FilterMode as VotingHistoryFilterMode,
  BillContext as VotingHistoryBillContext,
} from "../../src/components/VotingHistory";
import ReachOutTemplate from "../../src/components/ReachOutTemplate";

type Legislator = {
  id: string | number;
  name?: string;
  party?: string | null;
  district?: string | number | null;
  chamber?: string | null;
  title?: string | null;
  email?: string | null;
  openStatesId?: string | null;
  openstatesUrl?: string | null;
  contactUrl?: string | null;
  billContext?: {
    billId?: number | null;
    billNumber?: string | null;
    billTitle?: string | null;
  } | null;
};

type LegislatorPayload = {
  openStatesId?: string | number | null;
  name?: string | null;
  party?: string | null;
  district?: string | number | null;
  chamber?: string | null;
  title?: string | null;
  email?: string | null;
  openstatesUrl?: string | null;
  contactUrl?: string | null;
  billContext?: {
    billId?: string | number | null;
    billNumber?: string | null;
    billTitle?: string | null;
  } | null;
};

export default function LegislatorScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    payload?: string | string[];
    billId?: string | string[];
  }>();
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const payloadParam = Array.isArray(params.payload) ? params.payload[0] : params.payload;
  const billIdParam = Array.isArray(params.billId) ? params.billId[0] : params.billId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [leg, setLeg] = useState<Legislator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"supabase" | "fallback">("supabase");
  const [hasHistoryRows, setHasHistoryRows] = useState(false);
  const [selectedBillContext, setSelectedBillContext] =
    useState<VotingHistoryBillContext | null>(null);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)/advocacy");
    }
  }, [router]);

  const fallbackProfile = useMemo<Legislator | null>(() => {
    if (!payloadParam) return null;
    try {
      const parsed = JSON.parse(payloadParam) as LegislatorPayload;
      const openStatesId =
        typeof parsed.openStatesId === "string"
          ? parsed.openStatesId
          : typeof parsed.openStatesId === "number"
            ? String(parsed.openStatesId)
            : null;

      const rawBillContext = parsed.billContext ?? null;
      const normalizedBillId =
        typeof rawBillContext?.billId === "string"
          ? Number(rawBillContext.billId)
          : typeof rawBillContext?.billId === "number"
            ? rawBillContext.billId
            : null;
      const billIdValue =
        normalizedBillId !== null && !Number.isNaN(normalizedBillId) ? normalizedBillId : null;

      return {
        id: openStatesId ?? "lookup",
        name: parsed.name ?? undefined,
        party: parsed.party ?? null,
        district: parsed.district ?? null,
        chamber: parsed.chamber ?? null,
        title: parsed.title ?? null,
        email: parsed.email ?? null,
        openStatesId,
        openstatesUrl: parsed.openstatesUrl ?? null,
        contactUrl: parsed.contactUrl ?? null,
        billContext: rawBillContext
          ? {
              billId: billIdValue,
              billNumber: rawBillContext.billNumber ?? null,
              billTitle: rawBillContext.billTitle ?? null,
            }
          : null,
      };
    } catch (err) {
      console.warn("Failed to parse legislator payload", err);
      return null;
    }
  }, [payloadParam]);

  const initialVotingFilter = useMemo<VotingHistoryFilterMode | undefined>(() => {
    const routeBillNumeric = billIdParam ? Number(billIdParam) : null;
    if (routeBillNumeric !== null && !Number.isNaN(routeBillNumeric)) {
      return { billId: String(routeBillNumeric) };
    }
    const fallbackBillId = fallbackProfile?.billContext?.billId;
    if (
      fallbackBillId !== undefined &&
      fallbackBillId !== null &&
      !Number.isNaN(Number(fallbackBillId))
    ) {
      return { billId: String(fallbackBillId) };
    }
    return undefined;
  }, [billIdParam, fallbackProfile]);

  const fallbackTemplateBillContext = useMemo(() => {
    if (fallbackProfile?.billContext) {
      return {
        billNumber: fallbackProfile.billContext.billNumber ?? null,
        billTitle: fallbackProfile.billContext.billTitle ?? null,
      };
    }
    return null;
  }, [fallbackProfile]);

  const reachOutBillContext = useMemo(() => {
    if (selectedBillContext) {
      return {
        billNumber: selectedBillContext.billNumber ?? null,
        billTitle: selectedBillContext.billTitle ?? null,
      };
    }
    return fallbackTemplateBillContext;
  }, [selectedBillContext, fallbackTemplateBillContext]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);

      let nextLeg: Legislator | null = null;
      let nextError: string | null = null;
      let nextSource: "supabase" | "fallback" = "supabase";

      try {
        const idValue = idParam ?? "";

        if (!idValue) {
          if (fallbackProfile) {
            nextLeg = fallbackProfile;
            nextSource = "fallback";
          } else {
            throw new Error(t("legislator.invalidId", "Missing legislator identifier."));
          }
        } else if (idValue === "lookup") {
          if (fallbackProfile) {
            nextLeg = fallbackProfile;
            nextSource = "fallback";
          } else {
            throw new Error(t("legislator.invalidId", "Missing legislator identifier."));
          }
        } else {
          const numericId = Number(idValue);

          if (Number.isNaN(numericId)) {
            if (fallbackProfile) {
              nextLeg = fallbackProfile;
              nextSource = "fallback";
            } else {
              throw new Error(t("legislator.invalidId", "Missing legislator identifier."));
            }
          } else {
            const { data: legislatorData, error: legislatorError } = await supabase
              .from("legislators")
              .select("id,name,party,district,chamber,email,title")
              .eq("id", numericId)
              .maybeSingle();
            if (legislatorError) throw legislatorError;

            if (legislatorData) {
              nextLeg = {
                ...(legislatorData as Legislator),
                email: (legislatorData as any).email ?? fallbackProfile?.email ?? null,
                title: fallbackProfile?.title ?? null,
                openStatesId: fallbackProfile?.openStatesId ?? null,
                openstatesUrl: fallbackProfile?.openstatesUrl ?? null,
                contactUrl: fallbackProfile?.contactUrl ?? null,
              };
              nextSource = "supabase";
            } else if (fallbackProfile) {
              nextLeg = fallbackProfile;
              nextSource = "fallback";
            } else {
              throw new Error(
                t("legislator.missing", "We do not have that legislator on file yet."),
              );
            }
            }
          }
        }
      } catch (err: any) {
        if (fallbackProfile && !nextLeg) {
          nextLeg = fallbackProfile;
          nextSource = "fallback";
        }
        if (!fallbackProfile || !nextLeg) {
          nextError = err?.message ?? t("legislator.loadError", "Unable to load that legislator.");
        }
      } finally {
        if (isMounted) {
          setLeg(nextLeg);
          setSource(nextSource);
          setError(nextError);
          if (nextSource !== "supabase") {
            setHasHistoryRows(false);
            setSelectedBillContext(null);
          }
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [idParam, fallbackProfile, t]);

  const friendlyChamber = useMemo(() => {
    if (!leg?.chamber) return null;
    const normalized = String(leg.chamber).toLowerCase();
    if (normalized.includes("upper") || normalized.includes("senate")) {
      return t("chamber.upper", "Senate");
    }
    if (
      normalized.includes("lower") ||
      normalized.includes("house") ||
      normalized.includes("assembly")
    ) {
      return t("chamber.lower", "Assembly");
    }
    return leg.chamber;
  }, [leg?.chamber, t]);

  const header = useMemo(() => {
    const parts: string[] = [];
    if (leg?.name) parts.push(leg.name);
    if (leg?.party) parts.push(leg.party);
    if (leg?.title) parts.push(leg.title);
    if (friendlyChamber) parts.push(friendlyChamber);
    if (leg?.district) parts.push(`${t("legislator.district", "District")} ${leg.district}`);
    return parts.join(" • ");
  }, [leg, friendlyChamber, t]);

  const contactEmail = leg?.email && leg.email.includes("@") ? leg.email : null;

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: t("legislator.votingRecord", "Voting Record") }} />
        <Button
          onPress={handleGoBack}
          icon={() => <IconSymbol name="chevron.left" size={22} />}
          accessibilityRole="button"
          mode="text"
          style={{ alignSelf: "flex-start", marginBottom: 16 }}
        >
          {t("common.back", "Back")}
        </Button>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Stack.Screen options={{ title: t("legislator.votingRecord", "Voting Record") }} />
        <Button
          onPress={handleGoBack}
          icon={() => <IconSymbol name="chevron.left" size={22} />}
          accessibilityRole="button"
          mode="text"
          style={{ alignSelf: "flex-start", marginBottom: 16, marginLeft: 16 }}
        >
          {t("common.back", "Back")}
        </Button>
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
        <Button
          onPress={handleGoBack}
          icon={() => <IconSymbol name="chevron.left" size={24} />}
          accessibilityRole="button"
          mode="text"
          style={{ alignSelf: "flex-start", marginBottom: 16 }}
        >
          {t("common.back", "Back")}
        </Button>
        <Text variant="titleLarge" style={{ marginBottom: 12 }}>
          {header || t("legislator.votingRecord", "Voting Record")}
        </Text>

        {source === "fallback" && (
          <Text style={{ marginBottom: 16, opacity: 0.75 }}>
            {t(
              "legislator.fallbackNotice",
              "We are showing OpenStates data while we build a local record.",
            )}
          </Text>
        )}

        {(contactEmail || leg?.openstatesUrl) && (
          <Card style={{ marginBottom: 16 }} mode="outlined">
            <Card.Content>
              {contactEmail && (
                <Text style={{ marginBottom: 8 }}>
                  {t("legislator.contactEmail", "Email: {{email}}", { email: contactEmail })}
                </Text>
              )}
              {leg?.openstatesUrl && (
                <Text style={{ opacity: 0.75 }}>
                  {t("legislator.openStatesData", "Source: OpenStates.org")}
                </Text>
              )}
            </Card.Content>
            <Card.Actions>
              {contactEmail && (
                <Button
                  icon="email-outline"
                  onPress={() => Linking.openURL(`mailto:${contactEmail}`)}
                >
                  {t("common.email", "Email")}
                </Button>
              )}
              {leg?.contactUrl && (
                <Button
                  icon="link-variant"
                  onPress={() => {
                    const url = leg?.contactUrl;
                    if (url) Linking.openURL(url);
                  }}
                >
                  {t("legislator.contactForm", "Contact form")}
                </Button>
              )}
              {leg?.openstatesUrl && (
                <Button
                  icon="open-in-new"
                  onPress={() => {
                    const url = leg?.openstatesUrl;
                    if (url) Linking.openURL(url);
                  }}
                >
                  {t("legislator.openStatesProfile", "View on OpenStates")}
                </Button>
              )}
            </Card.Actions>
          </Card>
        )}

        {source === "supabase" && leg?.id ? (
          <VotingHistory
            legislatorId={String(leg.id)}
            initialFilter={initialVotingFilter}
            onRowsChange={(historyRows) => setHasHistoryRows(historyRows.length > 0)}
            onBillContextChange={setSelectedBillContext}
          />
        ) : (
          <Card mode="outlined" style={{ marginTop: 12 }}>
            <Card.Content>
              <Text>
                {t(
                  "legislator.noVotes",
                  "We have not recorded any votes for this legislator yet.",
                )}
              </Text>
            </Card.Content>
          </Card>
        )}

        {source === "supabase" && hasHistoryRows ? (
          <ReachOutTemplate legislator={leg} billContext={reachOutBillContext} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
