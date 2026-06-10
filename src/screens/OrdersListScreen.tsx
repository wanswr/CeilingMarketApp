import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { OrderService, Order } from '../services/OrderService';
import { COLORS, SHADOWS } from '../constants/theme';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Consumer: Subscribes to the single dispatcher
  useEffect(() => {
    const unsubscribe = OrderService.subscribe((newOrders) => {
      setOrders(newOrders);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 2. Focused Interest: Signal service that we need data
  const emitInterest = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 55.7558;
      let lng = 37.6173;

      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }

      console.log(`[OrdersListScreen] Emitting interest for ${lat}, ${lng}`);
      OrderService.emit('screenFocused', { lat, lng, radius: 100, latDelta: 0.2 });
    } catch (error) {
      console.error("[OrdersListScreen] Error emitting interest:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      emitInterest();
    }, [emitInterest])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await emitInterest();
    setTimeout(() => setRefreshing(false), 800);
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

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
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
            <Text style={styles.emptySubtext}>Попробуйте изменить фильтры или подождать новых заказов</Text>
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
