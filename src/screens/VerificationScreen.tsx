import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView, Alert } from 'react-native'
import { COLORS } from '../constants/theme'

export default function VerificationScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Верификация</Text>
      <TouchableOpacity style={styles.submitBtn} onPress={() => Alert.alert("Заглушка")}>
        <Text style={styles.submitText}>ОТПРАВИТЬ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
  submitBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold' }
});
