import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { orderService, Order } from '../services/OrderService';
import { auth } from '../services/firebase';
import { formatDate } from '../utils/date';

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

  useEffect(() => {
    if (order && order.employerId === auth.currentUser?.uid) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            style={{ marginRight: 15 }}
            onPress={() => navigation.navigate('EditOrder', { orderId: order.id })}
          >
            <Ionicons name="create-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )
      });
    }
  }, [order]);

  if (!order) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {order.images && order.images.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
            {order.images.map((img: string, idx: number) => (
              <Image key={idx} source={{ uri: img }} style={styles.heroImage} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.heroImage, { backgroundColor: COLORS.light, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="image-outline" size={64} color={COLORS.border} />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {order.status === 'pending' ? 'ОЖИДАНИЕ' : 'В РАБОТЕ'}
              </Text>
            </View>
            <Text style={styles.priceText}>{String(order.price)} ₽</Text>
          </View>

          <Text style={styles.title}>{order.title || 'Заказ без названия'}</Text>

          <View style={styles.infoSection}>
            <View style={styles.infoItem}>
              <Ionicons name="location" size={20} color={COLORS.primary} />
              <Text style={styles.infoText}>{order.address}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
              <Text style={styles.infoText}>Дата выполнения: {formatDate(order.date || order.timestamp)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Описание</Text>
          <Text style={styles.details}>{order.details || 'Описание не указано'}</Text>

          {role === 'employer' && order.status === 'pending' && (
            <View style={styles.candidatesSection}>
              <Text style={styles.sectionTitle}>Отклики ({order.candidates?.length || 0})</Text>
              {order.candidates && order.candidates.length > 0 ? (
                order.candidates.map((c, i) => (
                  <TouchableOpacity key={i} style={styles.candidateCard} onPress={() => orderService.confirmWorker(order.id, c)}>
                    <View style={styles.candidateHeader}>
                      <Ionicons name="person-circle" size={40} color={COLORS.gray} />
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={styles.candidateName}>{c.name || `Исполнитель #${i + 1}`}</Text>
                        <Text style={styles.candidateMeta}>⭐ 5.0 • 12 выполненных заказов</Text>
                      </View>
                      <View style={styles.selectBtn}>
                        <Text style={styles.selectBtnText}>Выбрать</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Пока никто не откликнулся</Text>
                </View>
              )}
            </View>
          )}

          {role === 'worker' && order.status === 'pending' && (
            <TouchableOpacity
              style={styles.mainBtn}
              onPress={async () => {
                const hasSub = await orderService.checkSubscription();
                if (hasSub) {
                  orderService.applyForOrder(order.id, 'me');
                  Alert.alert("Успех", "Ваш отклик успешно отправлен заказчику!");
                } else {
                  Alert.alert("Требуется подписка", "Для отклика на заказы необходимо активировать доступ.");
                }
              }}
            >
              <Text style={styles.mainBtnText}>ОТКЛИКНУТЬСЯ НА ЗАКАЗ</Text>
            </TouchableOpacity>
          )}

          {order.workerId === 'me' && order.status === 'in_work' && (
            <TouchableOpacity style={styles.mainBtn} onPress={() => orderService.updateStatus(order.id, 'executing')}>
              <Text style={styles.mainBtnText}>Я НА ОБЪЕКТЕ</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  imageScroll: { height: 250 },
  heroImage: { width: Dimensions.get('window').width, height: 250, resizeMode: 'cover' },
  content: { padding: 20, marginTop: -20, backgroundColor: COLORS.white, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  statusBadge: { backgroundColor: COLORS.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusText: { color: COLORS.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  priceText: { fontSize: 28, fontWeight: '900', color: COLORS.success },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.dark, marginBottom: 20 },
  infoSection: { marginBottom: 25 },
  infoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoText: { marginLeft: 10, fontSize: 15, color: COLORS.dark, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.light, marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 15 },
  details: { fontSize: 16, color: COLORS.gray, lineHeight: 24, marginBottom: 30 },
  mainBtn: { backgroundColor: COLORS.primary, paddingVertical: 20, borderRadius: 20, alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8 },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  candidatesSection: { marginTop: 10 },
  candidateCard: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: COLORS.light },
  candidateHeader: { flexDirection: 'row', alignItems: 'center' },
  candidateName: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  candidateMeta: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  selectBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  selectBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', padding: 20 },
  emptyText: { color: COLORS.gray, fontSize: 14 }
});
export default OrderDetailScreen;
