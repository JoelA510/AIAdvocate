// mobile-app/src/components/FindYourRep.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Card, Text, ActivityIndicator, useTheme, Divider } from 'react-native-paper';
import RNPickerSelect from 'react-native-picker-select';
import { findYourRep } from '../lib/find-your-representative';
import { supabase } from '../lib/supabase';
import { Bill } from './Bill';
import EmailTemplate from './EmailTemplate';

type FindYourRepProps = {
  bill?: Bill;
};
type SearchStatus = 'idle' | 'loading' | 'success' | 'empty';

export default function FindYourRep({ bill: initialBill }: FindYourRepProps) {
  const theme = useTheme();
  const [address, setAddress] = useState('');
  const [representatives, setRepresentatives] = useState<any[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(initialBill?.id || null);
  const [selectedLegislator, setSelectedLegislator] = useState<any | null>(null);

  useEffect(() => {
    if (!initialBill) {
      const fetchBills = async () => {
        const { data } = await supabase.from('bills').select('*').order('bill_number');
        if (data) setAllBills(data);
      };
      fetchBills();
    }
  }, [initialBill]);

  const handleFindRep = async () => {
    if (!address) return;
    setStatus('loading');
    setRepresentatives([]);
    setSelectedLegislator(null);
    const repsData = await findYourRep(address);
    if (repsData?.results) {
      const stateRepsOnly = repsData.results.filter(
        (rep: any) => rep.jurisdiction.name !== 'United States'
      );
      setRepresentatives(stateRepsOnly);
      setStatus(stateRepsOnly.length > 0 ? 'success' : 'empty');
    } else {
      setRepresentatives([]);
      setStatus('empty');
    }
  };

  const selectedBill = initialBill || allBills.find(b => b.id === Number(selectedBillId));

  if (selectedLegislator && selectedBill) {
    return (
      <View style={styles.container}>
        <Button icon="arrow-left" onPress={() => setSelectedLegislator(null)} style={{ alignSelf: 'flex-start' }}>
          Back to Representatives
        </Button>
        <EmailTemplate legislator={selectedLegislator} bill={selectedBill} />
      </View>
    );
  }

  const pickerItems = allBills.map(bill => ({
    label: `${bill.bill_number}: ${bill.title}`,
    value: bill.id,
  }));

  return (
    <View style={styles.container}>
      <Card mode="contained" style={{ backgroundColor: theme.colors.surfaceVariant }}>
        <Card.Content>
          <Text variant="titleLarge">{initialBill ? `Contact Legislators About ${initialBill.bill_number}` : 'Contact Your Legislators'}</Text>
          <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
            Step 1: Find your representatives by address.
          </Text>
          <TextInput
            label="Enter your full address"
            value={address}
            onChangeText={setAddress}
            style={styles.input}
            mode="outlined"
          />
          <Button mode="contained" onPress={handleFindRep} loading={status === 'loading'}>
            Find My Representatives
          </Button>
        </Card.Content>
      </Card>

      {status === 'loading' && <ActivityIndicator style={{ marginTop: 24 }} />}

      {(status === 'success' || status === 'empty') && (
        <View style={styles.resultsContainer}>
          <Divider style={styles.divider} />
          {!initialBill && (
            <>
              <Text variant="titleMedium" style={styles.stepHeader}>Step 2: Select a Bill to Discuss</Text>
              <View style={styles.pickerContainer}>
                <RNPickerSelect
                  placeholder={{ label: "Select a bill...", value: null }}
                  items={pickerItems}
                  onValueChange={(value) => setSelectedBillId(value)}
                  style={pickerSelectStyles(theme)}
                />
              </View>
            </>
          )}
          
          <Text variant="titleMedium" style={styles.stepHeader}>
            {initialBill ? 'Your Representatives' : 'Step 3: Choose a Representative'}
          </Text>
          
          {status === 'empty' && (
            <Text style={{ marginTop: 8 }}>No representatives found for this address.</Text>
          )}
          
          {status === 'success' && representatives.map(rep => {
            // --- FINAL CLEANUP: Removed the 'phone' variable ---
            const email = rep.email;

            return (
              <Card key={rep.id} style={styles.repCard} mode="outlined">
                <Card.Title title={rep.name} subtitle={rep.current_role.district ? `${rep.current_role.title}, District ${rep.current_role.district}` : rep.current_role.title} />
                <Card.Content>
                  {email && <Text variant="bodyMedium">Email: {email}</Text>}
                  {!email && <Text variant="bodyMedium" style={{ fontStyle: 'italic' }}>No contact information available.</Text>}
                </Card.Content>
                <Card.Actions>
                  <Button 
                    onPress={() => setSelectedLegislator(rep)} 
                    disabled={!selectedBill}
                  >
                    Contact Now
                  </Button>
                </Card.Actions>
              </Card>
            )
          })}
        </View>
      )}
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { marginTop: 16 },
  input: { marginVertical: 16 },
  resultsContainer: { marginTop: 24 },
  divider: { marginVertical: 24 },
  stepHeader: { marginBottom: 16, fontWeight: 'bold' },
  repCard: { marginBottom: 12 },
  pickerContainer: { backgroundColor: 'white', borderRadius: 8, marginBottom: 24 },
});

const pickerSelectStyles = (theme: any) => StyleSheet.create({
  inputIOS: { fontSize: 16, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.dark ? 'grey' : '#D3D3D3', borderRadius: 8, color: 'black', paddingRight: 30 },
  inputAndroid: { fontSize: 16, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: theme.dark ? 'grey' : '#D3D3D3', borderRadius: 8, color: 'black', paddingRight: 30 },
});