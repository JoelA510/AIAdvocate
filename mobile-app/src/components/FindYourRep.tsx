// mobile-app/src/components/FindYourRep.tsx (modified)
// Provides address/ZIP lookup for representatives.  Includes optional
// email template fill when a bill prop is provided.

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
import { useRouter } from "expo-router";
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
  const router = useRouter();

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
                  <Button icon="email-outline" onPress={() => composeEmail(p, email)}>
                    {t("common.email", "Email")}
                  </Button>
                )}
                <Button
                  mode="text"
                  onPress={() => {
                    if (p?.id) {
                      router.push(`/legislator/${p.id}`);
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
