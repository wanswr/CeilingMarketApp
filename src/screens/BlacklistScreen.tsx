import AppIcon from '../components/AppIcon';
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput } from 'react-native'
import { COLORS } from '../constants/theme'

const BlacklistScreen = () => {
  const [entries] = useState([
    { id: '1', name: 'Иван К.', phone: '+7 (999) 000-11-22', reason: 'Не оплатил заказ' },
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <AppIcon name="action-search" size={20} color={COLORS.gray} />
        <TextInput placeholder="Поиск в черном списке..." style={styles.searchInput} />
      </View>
      <FlatList
        data={entries}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.phone}>{item.phone}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  searchContainer: { flexDirection: 'row', backgroundColor: '#fff', margin: 15, padding: 10, borderRadius: 10 },
  searchInput: { flex: 1, marginLeft: 10 },
  card: { backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 10 },
  name: { fontSize: 18, fontWeight: 'bold', color: COLORS.danger },
  phone: { color: COLORS.gray },
  reason: { marginTop: 5 }
});

export default BlacklistScreen;