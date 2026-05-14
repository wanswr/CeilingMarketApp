import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeListView } from 'react-native-swipe-list-view';
import { COLORS } from '../constants/theme';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders] = useState([
    { id: '1', address: 'Москва, ул. Ленина, д. 5', price: '8500', date: '20.05.2024', status: 'pending' },
    { id: '2', address: 'Москва, пр. Мира, д. 45', price: '12000', date: '22.05.2024', status: 'started' },
  ]);

  const openMap = (address: string) => {
    const url = Platform.select({ ios: `maps:0,0?q=${address}`, android: `geo:0,0?q=${address}` });
    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <SwipeListView
        data={orders}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.rowFront}>
            <View style={styles.cardHeader}>
              <Text style={styles.dateText}>{item.date}</Text>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'started' ? COLORS.warning : COLORS.primary }]}>
                <Text style={styles.statusText}>{item.status === 'started' ? 'В работе' : 'Ожидание'}</Text>
              </View>
            </View>
            <Text style={styles.addressText}>{item.address}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.priceText}>{item.price} ₽</Text>
              <View style={styles.iconGroup}>
                <TouchableOpacity onPress={() => openMap(item.address)} style={styles.iconBtn}><Ionicons name="navigate-circle-outline" size={28} color={COLORS.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Chats')} style={styles.iconBtn}><Ionicons name="chatbubbles-outline" size={26} color={COLORS.secondary} /></TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        leftOpenValue={75}
        rightOpenValue={-75}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  rowFront: { backgroundColor: '#FFF', borderRadius: 15, padding: 15, margin: 15, marginBottom: 0, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  dateText: { color: COLORS.gray },
  statusBadge: { paddingHorizontal: 10, borderRadius: 10 },
  statusText: { color: '#fff', fontSize: 11 },
  addressText: { fontSize: 17, fontWeight: 'bold', marginVertical: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { fontSize: 18, color: COLORS.success, fontWeight: 'bold' },
  iconGroup: { flexDirection: 'row' },
  iconBtn: { marginLeft: 15 }
});

export default OrdersListScreen;