import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView, Image } from 'react-native';
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
        <Text style={styles.title}>{order.title || 'Заказ без названия'}</Text>
        <Text style={styles.price}>{String(order.price)} ₽</Text>
        <Text style={styles.address}>{order.address}</Text>
        <Text style={styles.date}>Дата: {order.date ? new Date(order.date).toLocaleDateString() : 'Не указана'}</Text>
        <Text style={styles.details}>{order.details}</Text>

        {order.images && order.images.length > 0 && (
          <View style={styles.imagesContainer}>
            <Text style={styles.sectionTitle}>Фотографии:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {order.images.map((img: string, idx: number) => (
                <Image key={idx} source={{ uri: img }} style={styles.image} />
              ))}
            </ScrollView>
          </View>
        )}
        
        {role === 'worker' && order.status === 'pending' && (
          <TouchableOpacity
            style={styles.btn}
            onPress={async () => {
              const hasSub = await orderService.checkSubscription();
              if (hasSub) {
                orderService.applyForOrder(order.id, 'me');
                Alert.alert("Успех", "Отклик отправлен");
              } else {
                Alert.alert("Требуется подписка", "Для отклика на заказы необходимо активировать доступ. Ваш пробный период мог истечь.");
              }
            }}
          >
            <Text style={styles.btnText}>ВЗЯТЬ ЗАКАЗ</Text>
          </TouchableOpacity>
        )}

        {role === 'employer' && order.status === 'pending' && order.candidates && order.candidates.length > 0 && (
          <View>
            <Text style={{fontWeight:'bold', marginBottom:10}}>Отклики:</Text>
            {order.candidates.map((c, i) => (
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
  container: { flex: 1, backgroundColor: COLORS.white },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.dark, marginBottom: 10 },
  price: { fontSize: 32, fontWeight: '800', color: COLORS.success, marginBottom: 8 },
  address: { fontSize: 18, fontWeight: '600', color: COLORS.gray, marginBottom: 4 },
  date: { fontSize: 16, color: COLORS.primary, marginBottom: 20, fontWeight: '700' },
  details: { fontSize: 16, color: COLORS.dark, lineHeight: 24, marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: COLORS.dark },
  imagesContainer: { marginBottom: 32 },
  image: { width: 200, height: 150, borderRadius: 12, marginRight: 12 },
  btn: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 18, alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  candidate: { padding: 18, backgroundColor: COLORS.light, borderRadius: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
});
export default OrderDetailScreen;
