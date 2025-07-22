import { useState } from "react";
import { StyleSheet, View, Linking } from "react-native";
import { TextInput, Button, Text, Card, useTheme } from "react-native-paper";
import { ThemedView } from "../../components/ThemedView";
import { findYourRep } from "../../src/lib/find-your-representative";

export default function AdvocacyScreen() {
  const [address, setAddress] = useState("");
  const [representatives, setRepresentatives] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleFindRep = async () => {
    setLoading(true);
    const reps = await findYourRep(address);
    if (reps) {
      setRepresentatives(reps.officials);
    }
    setLoading(false);
  };

  const handleContact = (email: string) => {
    const subject = "Regarding [Bill Name/Issue]";
    const body = "Dear [Representative Name],\n\nI am writing to you today as a concerned constituent...\n\n[Your message here]\n\nSincerely,\n[Your Name]";
    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailtoUrl).catch((err) => console.error("Couldn't load page", err));
  };

  return (
    <ThemedView style={styles.container}>
      <Text style={styles.title}>Take Action</Text>
      <TextInput
        label="Enter your full address"
        value={address}
        onChangeText={setAddress}
        style={styles.input}
      />
      <Button mode="contained" onPress={handleFindRep} loading={loading} style={styles.button}>
        Find My Representatives
      </Button>

      {representatives && (
        <View style={styles.resultsContainer}>
          {representatives.map((rep, index) => (
            <Card key={index} style={styles.repCard}>
              <Card.Content>
                <Text style={styles.repName}>{rep.name}</Text>
                <Text style={styles.repParty}>{rep.party}</Text>
              </Card.Content>
              <Card.Actions>
                <Button onPress={() => handleContact(rep.email)} disabled={!rep.email}>
                  Contact
                </Button>
              </Card.Actions>
            </Card>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginBottom: 16,
  },
  resultsContainer: {
    marginTop: 16,
  },
  repCard: {
    marginBottom: 12,
  },
  repName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  repParty: {
    fontSize: 14,
    color: "gray",
  },
});
