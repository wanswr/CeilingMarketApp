import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { COLORS } from '../constants/theme';

export default function SubscriptionScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Подписка</Text>
      <TouchableOpacity style={styles.submitBtn} onPress={() => Alert.alert("Заглушка")}>
         <Text style={styles.submitText}>ОПЛАТИТЬ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
  submitBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold' }
});
