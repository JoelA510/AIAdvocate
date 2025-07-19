import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { TextInput, Button, Text } from "react-native-paper";
import { Link } from "expo-router";

import { findYourRep } from "../src/lib/find-your-rep";
import { ThemedView } from "../../components/ThemedView";

export default function FindYourRepScreen() {
  const [address, setAddress] = useState("");
  const [representatives, setRepresentatives] = useState<any[] | null>(null);

  const handleFindRep = async () => {
    const reps = await findYourRep(address);
    setRepresentatives(reps.officials);
  };

  return (
    <ThemedView style={styles.container}>
      <TextInput
        label="Enter your address"
        value={address}
        onChangeText={setAddress}
        style={styles.input}
      />
      <Button mode="contained" onPress={handleFindRep} style={styles.button}>
        Find My Reps
      </Button>
      {representatives && (
        <View style={styles.resultsContainer}>
          {representatives.map((rep, index) => (
            <Link key={index} href={`/legislator/${rep.id}`}>
              <Text>{rep.name}</Text>
            </Link>
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
  input: {
    marginBottom: 16,
  },
  button: {
    marginBottom: 16,
  },
  resultsContainer: {
    marginTop: 16,
  },
});
