import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking, Modal, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeListView } from 'react-native-swipe-list-view';
import { COLORS } from '../constants/theme';
import { apiService } from '../services/ApiService';
import { formatDate } from '../utils/date';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await apiService.getOrders({});
      setOrders(response.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary}/></View>;

  return (
    <View style={styles.container}>
      <SwipeListView
        data={orders}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            style={[styles.rowFront, item.isPinned && styles.pinnedRow]}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: COLORS.primary }]}>
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.titleText} numberOfLines={1}>{item.title}</Text>

              <View style={styles.addressRow}>
                <Ionicons name="location-sharp" size={14} color={COLORS.gray} />
                <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.priceText}>{item.price} ₽</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.border} />
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowFront: { backgroundColor: '#FFF', borderRadius: 15, marginHorizontal: 15, marginTop: 15, padding: 15 },
  pinnedRow: { borderColor: COLORS.primary, borderWidth: 1 },
  cardContent: {},
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  dateText: { color: COLORS.gray, fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  titleText: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addressText: { fontSize: 14, color: COLORS.gray, marginLeft: 5 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  priceText: { fontSize: 18, fontWeight: 'bold', color: COLORS.success },
});

export default OrdersListScreen;
