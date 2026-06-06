import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, SafeAreaView } from 'react-native';
import { OrderService, Order } from '../services/OrderService';
import { COLORS } from '../constants/theme';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      // For list view without specific location, we might want to get all pending orders
      const data = await OrderService.getNearbyOrders(55.7558, 37.6173, 100); // Default to Moscow for demo
      setOrders(data);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Order }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <Text style={styles.orderTitle}>{item.title}</Text>
      <Text style={styles.orderPrice}>{item.price} ₽</Text>
      <Text style={styles.orderAddress}>{item.address}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>Заказов пока нет</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 15 },
  orderCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  orderTitle: { fontSize: 18, fontWeight: 'bold' },
  orderPrice: { fontSize: 16, color: COLORS.primary, marginVertical: 5 },
  orderAddress: { fontSize: 14, color: '#666' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 }
});

export default OrdersListScreen;
