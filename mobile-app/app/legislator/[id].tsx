import { useState, useEffect } from "react";
import { StyleSheet, View, Linking, Share } from "react-native";
import { Text, Card, Avatar, Button } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";

import { supabase } from "../../src/lib/supabase";
import { ThemedView } from "../../components/ThemedView";

export default function LegislatorProfileScreen() {
  const { id } = useLocalSearchParams();
  const [legislator, setLegislator] = useState<any>(null);
  const [votes, setVotes] = useState<any[]>([]);

  useEffect(() => {
    const fetchLegislator = async () => {
      const { data, error } = await supabase
        .from("legislators")
        .select("*")
        .eq("id", id)
        .single();
      if (error) console.error(error);
      else setLegislator(data);
    };

    const fetchVotes = async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("*, bills(*)")
        .eq("legislator_id", id);
      if (error) console.error(error);
      else setVotes(data);
    };

    fetchLegislator();
    fetchVotes();
  }, [id]);

  const handleTakeAction = () => {
    const email = legislator.email; // Assuming email is available in the legislator data
    const subject = "Regarding [Bill Number/Topic]";
    const body = `Dear ${legislator.name},\n\nI am writing to you today to...`;
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this legislator: https://aiadvocate.com/legislator/${id}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  if (!legislator) {
    return <Text>Loading...</Text>;
  }

  return (
    <ThemedView style={styles.container}>
      <Card>
        <Card.Title
          title={legislator.name}
          subtitle={`${legislator.chamber} - District ${legislator.district}`}
          left={(props) => <Avatar.Image {...props} source={{ uri: legislator.photo_url }} />}
        />
        <Card.Content>
          <Text>Party: {legislator.party}</Text>
          {legislator.is_lnf_ally && <Text>LNF Ally</Text>}
        </Card.Content>
        <Card.Actions>
          <Button onPress={handleTakeAction}>Take Action</Button>
          <Button onPress={handleShare}>Share</Button>
        </Card.Actions>
      </Card>
      <View style={styles.votesContainer}>
        <Text style={styles.votesTitle}>Voting Record</Text>
        {votes.map((vote) => (
          <Card key={vote.bill_id} style={styles.voteCard}>
            <Card.Content>
              <Text>{vote.bills.bill_number}</Text>
              <Text>{vote.bills.title}</Text>
              <Text>Vote: {vote.vote_option}</Text>
            </Card.Content>
          </Card>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  votesContainer: {
    marginTop: 16,
  },
  votesTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  voteCard: {
    marginBottom: 8,
  },
});
