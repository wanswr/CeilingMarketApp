import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { orderService, Order } from '../services/OrderService';

const OrderDetailScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const role = orderService.getCurrentRole();

  useEffect(() => {
    const load = () => setOrder(orderService.getOrders().find(o => o.id === orderId) || null);
    load();
    orderService.on('ordersUpdated', load);
    return () => { orderService.off('ordersUpdated', load); };
  }, [orderId]);

  if (!order) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.price}>{order.price} ₽</Text>
        <Text style={styles.address}>{order.address}</Text>
        <Text style={styles.details}>{order.details}</Text>
        
        {role === 'worker' && order.status === 'pending' && (
          <TouchableOpacity style={styles.btn} onPress={() => { orderService.applyForOrder(order.id, 'me'); Alert.alert("Успех", "Отклик отправлен"); }}>
            <Text style={styles.btnText}>ВЗЯТЬ ЗАКАЗ</Text>
          </TouchableOpacity>
        )}

        {role === 'employer' && order.status === 'pending' && (order.candidates?.length ?? 0) > 0 && (
          <View>
            <Text style={{fontWeight:'bold', marginBottom:10}}>Отклики:</Text>
            {order.candidates?.map((c, i) => (
              <TouchableOpacity key={i} style={styles.candidate} onPress={() => orderService.confirmWorker(order.id, c)}>
                <Text>Мастер #{i+1} - Выбрать</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        {order.workerId === 'me' && order.status === 'in_work' && (
          <TouchableOpacity style={styles.btn} onPress={() => orderService.updateStatus(order.id, 'executing')}>
            <Text style={styles.btnText}>Я НА ОБЪЕКТЕ</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  price: { fontSize: 32, fontWeight: 'bold', color: COLORS.success },
  address: { fontSize: 20, fontWeight: 'bold', marginVertical: 10 },
  details: { fontSize: 16, color: '#666', marginBottom: 30 },
  btn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  candidate: { padding: 15, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 5 }
});
export default OrderDetailScreen;