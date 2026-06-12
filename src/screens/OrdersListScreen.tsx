import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { orderOrchestrator } from '../services/OrderOrchestrator';
import { Order } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>(orderOrchestrator.getOrders());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(orders.length === 0);

  // Subscribe to the central orchestrator
  useEffect(() => {
    const unsubscribe = orderOrchestrator.subscribe((newOrders) => {
      setOrders(newOrders);
      setLoading(false);
    });

    // Ensure data is loaded even if we start here
    if (orderOrchestrator.getOrders().length === 0) {
      orderOrchestrator.syncMap();
    }

    return () => { unsubscribe(); };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await orderOrchestrator.forceRefresh();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Order }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.orderTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.priceContainer}>
          <Text style={styles.orderPrice}>{item.price} ₽</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={16} color={COLORS.gray} />
          <Text style={styles.orderAddress} numberOfLines={1}>{item.address}</Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceText}>{item.distance?.toFixed(1) || '0.0'} км от вас</Text>
          </View>
          <View style={styles.dateBadge}>
            <Text style={styles.dateText}>Сегодня</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 200, height: 28, backgroundColor: '#f0f0f0', borderRadius: 8 }} />
          <View style={{ width: 150, height: 15, backgroundColor: '#f0f0f0', borderRadius: 4, marginTop: 10 }} />
        </View>
        <View style={{ padding: 20 }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.orderCard, { height: 120, backgroundColor: '#f9f9f9', borderColor: '#eee' }]}>
               <View style={{ width: '60%', height: 20, backgroundColor: '#f0f0f0', borderRadius: 4 }} />
               <View style={{ width: '40%', height: 14, backgroundColor: '#f0f0f0', borderRadius: 4, marginTop: 15 }} />
               <View style={{ width: '100%', height: 12, backgroundColor: '#f0f0f0', borderRadius: 4, marginTop: 15 }} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Доступные заказы</Text>
        <Text style={styles.headerSubtitle}>{orders.length} предложений рядом</Text>
      </View>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={64} color={COLORS.border} />
            <Text style={styles.emptyText}>Заказов пока нет</Text>
            <Text style={styles.emptySubtext}>Попробуйте изменить масштаб на карте или подождать новых заказов</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 20, marginBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: COLORS.dark, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 15, color: COLORS.gray, marginTop: 4, fontWeight: '500' },
  list: { padding: 20, paddingTop: 10 },
  orderCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  orderTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, flex: 1, marginRight: 15, lineHeight: 24 },
  priceContainer: { backgroundColor: 'rgba(45, 91, 255, 0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  orderPrice: { fontSize: 17, color: COLORS.primary, fontWeight: '800' },
  cardContent: { gap: 12 },
  locationContainer: { flexDirection: 'row', alignItems: 'center' },
  orderAddress: { fontSize: 14, color: COLORS.gray, marginLeft: 6, flex: 1, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  distanceBadge: { backgroundColor: COLORS.light, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
  distanceText: { fontSize: 12, color: COLORS.dark, fontWeight: '600' },
  dateBadge: { backgroundColor: 'rgba(0, 200, 151, 0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dateText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginTop: 20 },
  emptySubtext: { fontSize: 15, color: COLORS.gray, textAlign: 'center', marginTop: 8, lineHeight: 22 }
});

export default OrdersListScreen;
