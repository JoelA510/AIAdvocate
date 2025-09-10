// app/legislator/[id].tsx
import React, { useEffect, useState, useCallback } from "react";
import { StyleSheet, View, ScrollView, Share, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Card, Text, Button, ActivityIndicator, Divider, useTheme } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { IconSymbol } from "../../components/ui/IconSymbol"; // keep relative if your tsconfig paths aren't universal on web
import { ThemedView } from "../../components/ThemedView";
import EmailTemplate from "@/components/EmailTemplate";

type Legislator = {
  id: string | number;
  name?: string;
  party?: string;
  email?: string | null;
  url?: string | null;
  current_role?: {
    title?: string | null;
    org_classification?: "upper" | "lower" | null;
    district?: string | number | null;
  } | null;
  offices?: { email?: string | null; voice?: string | null }[] | null;
};

type Vote = { id: string | number; bill_number?: string | null; vote_option?: string | null };

export default function LegislatorDetails() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [legislator, setLegislator] = useState<Legislator | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: leg, error: e1 } = await supabase
        .from("legislators")
        .select("id, name, party, email, url, current_role, offices")
        .eq("id", id)
        .single();

      if (e1) throw e1;
      setLegislator(leg as Legislator);

      const { data: voteRows, error: e2 } = await supabase
        .from("votes")
        .select("id, bill_number, vote_option")
        .eq("legislator_id", id)
        .order("id", { ascending: false })
        .limit(10);

      if (e2) throw e2;
      setVotes(voteRows || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch legislator");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleShare = async () => {
    if (!legislator) return;
    try {
      await Share.share({
        message: t("share.legislatorMessage", {
          defaultValue: "Check out {{name}}",
          name: legislator.name ?? t("legislator.unknown", { defaultValue: "this legislator" }),
        }),
        url: legislator.url ?? undefined,
      });
    } catch {
      // swallow share errors
    }
  };

  const back = () => router.back();

  const openProfile = async () => {
    const raw = (legislator?.url ?? "").trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      await Linking.openURL(url);
    } catch {
      // optionally surface a toast/snackbar
    }
  };

  if (loading) {
    return (
      <ThemedView
        style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      >
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error || !legislator) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Button onPress={back} icon={() => <IconSymbol name="chevron.left" size={22} />}>
          {t("common.back", { defaultValue: "Back" })}
        </Button>
        <Text style={{ marginTop: 12, color: theme.colors.error }}>
          {error ?? t("error.title", { defaultValue: "An Error Occurred" })}
        </Text>
      </View>
    );
  }

  const chamberKey = legislator.current_role?.org_classification === "upper" ? "upper" : "lower";
  const chamber = t(`chamber.${chamberKey}`, {
    defaultValue: chamberKey === "upper" ? "Senate" : "Assembly",
  });

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        padding: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Button onPress={back} icon={() => <IconSymbol name="chevron.left" size={22} />}>
        {t("common.back", { defaultValue: "Back" })}
      </Button>

      <Text variant="headlineMedium" style={{ marginTop: 8 }}>
        {legislator.name ?? "—"}
      </Text>
      <Text style={{ marginTop: 4 }}>
        {t("legislator.partyLabel", {
          defaultValue: "Party: {{party}}",
          party: legislator.party ?? "—",
        })}
      </Text>
      <Text style={{ marginTop: 2 }}>
        {chamber}
        {legislator.current_role?.district
          ? ` • ${t("legislator.district", { defaultValue: "District" })} ${
              legislator.current_role.district
            }`
          : ""}
      </Text>

      <View style={{ flexDirection: "row", columnGap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button
          mode="contained"
          onPress={() => {
            // e.g., router.push("/(tabs)/advocacy");
          }}
        >
          {t("legislator.cta.takeAction", { defaultValue: "Take Action" })}
        </Button>
        <Button mode="text" onPress={handleShare}>
          {t("common.share", { defaultValue: "Share" })}
        </Button>
        {!!(legislator.url && legislator.url.trim()) && (
          <Button mode="outlined" onPress={openProfile}>
            {t("legislator.cta.viewProfile", { defaultValue: "View Profile" })}
          </Button>
        )}
      </View>

      <Divider style={{ marginVertical: 16 }} />

      <Text variant="titleLarge" style={styles.sectionTitle}>
        {t("email.composeTo", { defaultValue: "Compose an Email" })}
      </Text>
      {/* If EmailTemplate expects specific bill shape, pass a Partial or adjust its prop types */}
      <EmailTemplate legislator={legislator} bill={{}} />

      {!!votes.length && (
        <>
          <Divider style={{ marginVertical: 16 }} />
          <Text variant="titleLarge" style={styles.sectionTitle}>
            {t("legislator.votingRecord", { defaultValue: "Voting Record" })}
          </Text>
          {votes.map((v) => (
            <Card key={String(v.id)} mode="outlined" style={{ marginTop: 8 }}>
              <Card.Content>
                <Text>
                  {t("legislator.vote", {
                    defaultValue: "Vote: {{option}}",
                    option: v.vote_option ?? "—",
                  })}{" "}
                  {v.bill_number ? `• ${v.bill_number}` : ""}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { marginBottom: 8 },
});
