// mobile-app/app/(tabs)/advocacy.tsx
import React, { useCallback, useState } from "react";
import { StyleSheet, View, FlatList, Linking } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Card, TextInput, Button, ActivityIndicator } from "react-native-paper";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";

const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY;
const OPENSTATES_KEY = process.env.EXPO_PUBLIC_OPENSTATES_KEY;

// OpenStates v3 docs: root + /people.geo with X-API-KEY or ?apikey=
// https://v3.openstates.org/ (see API v3 Overview) and /people.geo method.

type Official = {
  office: string;
  name: string;
  party?: string;
  phones?: string[];
  emails?: string[];
  urls?: string[];
};

export default function AdvocacyScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Official[]>([]);
  const [error, setError] = useState<string | null>(null);

  const geocode = useCallback(async (q: string) => {
    if (!LOCATIONIQ_KEY) {
      throw new Error("LocationIQ is not configured. Set EXPO_PUBLIC_LOCATIONIQ_KEY in your .env.");
    }
    const url =
      "https://us1.locationiq.com/v1/search" +
      `?key=${encodeURIComponent(LOCATIONIQ_KEY)}` +
      `&q=${encodeURIComponent(q)}` +
      "&format=json&limit=1";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const json = await res.json();
    const first = Array.isArray(json) ? json[0] : null;
    if (!first?.lat || !first?.lon) throw new Error("No results for that address/ZIP.");
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
  }, []);

  const fetchPeople = useCallback(
    async (lat: number, lng: number) => {
      if (!OPENSTATES_KEY) {
        throw new Error(
          "OpenStates is not configured. Set EXPO_PUBLIC_OPENSTATES_KEY in your .env.",
        );
      }
      const url =
        "https://v3.openstates.org/people.geo" +
        `?lat=${encodeURIComponent(lat)}` +
        `&lng=${encodeURIComponent(lng)}`;
      const res = await fetch(url, { headers: { "X-API-KEY": OPENSTATES_KEY } });
      if (!res.ok) throw new Error(`OpenStates lookup failed (${res.status})`);
      const json = await res.json();

      // The API returns a list under `results` (plus pagination).
      // We'll map robustly in case of shape variance.
      const people: any[] = Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json)
          ? json
          : [];

      const mapped: Official[] = people.map((p) => {
        // current role info for office label
        const cr = p.current_role || p.currentRole || {};
        const district = cr.district || cr.district_name || cr.division_id || "";
        const chamber = cr.org_classification || cr.orgClassification || cr.classification || "";
        const office =
          (chamber === "upper"
            ? t("chamber.upper", { defaultValue: "State Senate" })
            : chamber === "lower"
              ? t("chamber.lower", { defaultValue: "State House/Assembly" })
              : cr.title || t("advocacy.legislator", { defaultValue: "Legislator" })) +
          (district ? ` • ${district}` : "");

        const party =
          p.party ||
          p.current_party ||
          (Array.isArray(p.parties) && p.parties[0]?.name) ||
          undefined;

        // contact info: prefer person.email, then offices[].email/voice, then links[]
        const emails: string[] = [];
        const phones: string[] = [];
        const urls: string[] = [];

        if (p.email) emails.push(p.email);
        if (Array.isArray(p.offices)) {
          p.offices.forEach((o: any) => {
            if (o?.email && !emails.includes(o.email)) emails.push(o.email);
            if (o?.voice && !phones.includes(o.voice)) phones.push(o.voice);
            if (o?.url && !urls.includes(o.url)) urls.push(o.url);
          });
        }
        if (Array.isArray(p.links)) {
          p.links.forEach((l: any) => {
            if (l?.url && !urls.includes(l.url)) urls.push(l.url);
          });
        }

        return {
          office,
          name: p.name || p.name_given + " " + p.name_family || "—",
          party,
          phones,
          emails,
          urls,
        };
      });

      // sort by chamber (upper first), then name
      mapped.sort((a, b) => a.office.localeCompare(b.office));
      return mapped;
    },
    [t],
  );

  const lookup = useCallback(async () => {
    const query = addr.trim();
    setRows([]);
    setError(null);
    if (!query) return;
    setLoading(true);
    try {
      const { lat, lng } = await geocode(query); // LocationIQ forward geocoding. :contentReference[oaicite:2]{index=2}
      const officials = await fetchPeople(lat, lng); // OpenStates /people.geo. :contentReference[oaicite:3]{index=3}
      setRows(officials);
    } catch (e: any) {
      setError(e?.message ?? "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, [addr, geocode, fetchPeople]);

  const openFirst = (xs?: string[]) => {
    const u = xs?.[0];
    if (u) Linking.openURL(u).catch(() => {});
  };
  const callFirst = (xs?: string[]) => {
    const p = xs?.[0];
    if (p) Linking.openURL(`tel:${p}`).catch(() => {});
  };
  const emailFirst = (xs?: string[]) => {
    const e = xs?.[0];
    if (e) Linking.openURL(`mailto:${e}`).catch(() => {});
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: t("tabs.advocacy", { defaultValue: "Advocacy" }),
          headerShown: false,
        }}
      />
      <View style={[styles.content, { paddingTop: insets.top }]}>
        <ThemedText type="title">
          {t("advocacy.lookupTitle", { defaultValue: "Find Your Representatives" })}
        </ThemedText>

        <TextInput
          mode="outlined"
          value={addr}
          onChangeText={setAddr}
          onSubmitEditing={lookup}
          placeholder={t("advocacy.addressPlaceholder", {
            defaultValue: "Enter address or ZIP…",
          })}
          right={<TextInput.Icon icon="magnify" onPress={lookup} forceTextInputFocus={false} />}
          style={{ marginTop: 12 }}
        />

        {error ? (
          <ThemedText style={{ marginTop: 12 }}>{error}</ThemedText>
        ) : loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : rows.length ? (
          <FlatList
            style={{ marginTop: 12 }}
            data={rows}
            keyExtractor={(x, i) => `${x.name}-${x.office}-${i}`}
            renderItem={({ item }) => (
              <Card mode="outlined" style={{ marginBottom: 10 }}>
                <Card.Title
                  title={item.office}
                  subtitle={`${item.name}${item.party ? " • " + item.party : ""}`}
                />
                <Card.Actions style={{ justifyContent: "flex-end" }}>
                  <Button onPress={() => callFirst(item.phones)}>
                    {t("common.call", { defaultValue: "Call" })}
                  </Button>
                  <Button onPress={() => emailFirst(item.emails)}>
                    {t("common.email", { defaultValue: "Email" })}
                  </Button>
                  <Button mode="contained" onPress={() => openFirst(item.urls)}>
                    {t("common.website", { defaultValue: "Website" })}
                  </Button>
                </Card.Actions>
              </Card>
            )}
          />
        ) : (
          <ThemedText style={{ marginTop: 12 }}>
            {t("advocacy.helper", {
              defaultValue: "Enter your address or ZIP to see your state/federal legislators.",
            })}
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  loading: { paddingVertical: 16, alignItems: "center" },
});
