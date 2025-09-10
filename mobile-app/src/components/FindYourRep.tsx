import React, { useState } from "react";
import { View, StyleSheet, Linking, Platform } from "react-native";
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
import { findYourRep } from "@/lib/find-your-representative";

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
};

function nameOf(p: Person) {
  return p?.name ?? "—";
}

export default function FindYourRep({ bill }: { bill?: any }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [value, setValue] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSearch = async () => {
    setErr(null);
    if (!value.trim()) {
      setErr(t("findYourRep.error.empty", "Please enter an address or ZIP code."));
      return;
    }
    setLoading(true);
    try {
      const res = await findYourRep(value);
      const people: Person[] = Array.isArray(res?.results)
        ? (res?.results as Person[])
        : (res as unknown as Person[]);
      if (!people?.length) {
        setErr(t("findYourRep.error.none", "No representatives found for that location."));
      }
      setResults(people || []);
    } catch (e: any) {
      setErr(e?.message ?? t("findYourRep.error.generic", "Failed to look up representatives."));
    } finally {
      setLoading(false);
    }
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

      <Divider style={{ marginVertical: 16 }} />

      {loading ? (
        <ActivityIndicator />
      ) : (
        results.map((p, idx) => {
          const email = p?.email || p?.offices?.find((o) => !!o?.email)?.email || null;

          const chamberKey = p?.current_role?.org_classification === "upper" ? "upper" : "lower";
          const chamber = t(
            `chamber.${chamberKey}`,
            chamberKey === "upper" ? "Senate" : "Assembly",
          );
          const district = p?.current_role?.district;

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
              <Card.Actions>
                {email && (
                  <Button icon="email-outline" onPress={() => Linking.openURL(`mailto:${email}`)}>
                    {t("common.email", "Email")}
                  </Button>
                )}
                <Button
                  mode="text"
                  onPress={() => {
                    if (p?.id) {
                      // If you have a router here, use router.push(`/legislator/${p.id}`)
                      if (typeof window !== "undefined") {
                        // web fallback
                        window.location.href = `/legislator/${p.id}`;
                      }
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
