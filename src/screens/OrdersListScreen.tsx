import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeListView } from 'react-native-swipe-list-view';
import { COLORS } from '../constants/theme';
import { orderService, Order } from '../services/OrderService';
import { formatDate } from '../utils/date';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>(orderService.getOrders());

  useEffect(() => {
    const updateOrders = (newOrders: Order[]) => setOrders([...newOrders]);
    orderService.on('ordersUpdated', updateOrders);
    return () => { orderService.off('ordersUpdated', updateOrders); };
  }, []);

  const openMap = (address: string) => {
    const url = Platform.select({ ios: `maps:0,0?q=${address}`, android: `geo:0,0?q=${address}` });
    if (url) Linking.openURL(url);
  };

  const handleAction = (orderId: string, action: 'accept' | 'delete') => {
    if (action === 'delete') {
      Alert.alert(
        "Удаление",
        "Вы уверены, что хотите удалить этот заказ?",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Удалить",
            style: "destructive",
            onPress: () => {
              // Add delete logic to OrderService if needed
              console.log('Delete order', orderId);
            }
          }
        ]
      );
    } else {
      Alert.alert("Принять", "Вы подтверждаете выполнение этого заказа?");
    }
  };

  return (
    <View style={styles.container}>
      <SwipeListView
        data={orders}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            style={styles.rowFront}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.dateText}>
                {formatDate(item.date || item.timestamp)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'started' ? COLORS.warning : COLORS.primary }]}>
                <Text style={styles.statusText}>{item.status === 'started' ? 'В работе' : 'Ожидание'}</Text>
              </View>
            </View>
            <Text style={styles.titleText}>{item.title || 'Заказ без названия'}</Text>
            <Text style={styles.addressText}>{item.address}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.priceText}>{item.price} ₽</Text>
              <View style={styles.iconGroup}>
                <TouchableOpacity onPress={() => openMap(item.address)} style={styles.iconBtn}><Ionicons name="navigate-circle-outline" size={28} color={COLORS.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Chats')} style={styles.iconBtn}><Ionicons name="chatbubbles-outline" size={26} color={COLORS.secondary} /></TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
        renderHiddenItem={({ item }) => (
          <View style={styles.rowBack}>
            <TouchableOpacity
              style={[styles.backLeftBtn]}
              onPress={() => handleAction(item.id, 'accept')}
            >
              <Ionicons name="checkmark-circle" size={28} color="#fff" />
              <Text style={styles.backTextWhite}>Принять</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.backRightBtn]}
              onPress={() => handleAction(item.id, 'delete')}
            >
              <Ionicons name="trash" size={28} color="#fff" />
              <Text style={styles.backTextWhite}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
        leftOpenValue={80}
        rightOpenValue={-80}
        stopLeftSwipe={100}
        stopRightSwipe={-100}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  rowFront: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 15,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { color: COLORS.gray, fontSize: 13, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  titleText: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginTop: 12 },
  addressText: { fontSize: 15, fontWeight: '500', color: COLORS.gray, marginBottom: 12, marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  priceText: { fontSize: 20, color: COLORS.success, fontWeight: '800' },
  iconGroup: { flexDirection: 'row' },
  iconBtn: { marginLeft: 15 },
  rowBack: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 15,
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 20,
  },
  backLeftBtn: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 80,
    backgroundColor: COLORS.success,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    left: 0,
  },
  backRightBtn: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 80,
    backgroundColor: COLORS.danger,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    right: 0,
  },
  backTextWhite: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
});

export default OrdersListScreen;