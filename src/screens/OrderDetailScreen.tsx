import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { COLORS } from '../constants/theme';
import { formatDate } from '../utils/date';
import { Order, OrderStatus } from '../types';
import { orderService } from '../services/OrderService';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [employer, setEmployer] = useState<any>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const currentRole = orderService.getCurrentRole();

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const data = snap.id ? { ...snap.data() as Order, id: snap.id } : snap.data() as Order;
        setOrder(data);

        // Fetch employer
        const empRef = doc(db, "users", data.employerId);
        const empSnap = await getDoc(empRef);
        if (empSnap.exists()) setEmployer(empSnap.data());

        // Try fetch phone if involved in order
        if (data.status !== 'pending' && (data.workerId === auth.currentUser?.uid || data.employerId === auth.currentUser?.uid)) {
            const targetId = data.employerId === auth.currentUser?.uid ? data.workerId! : data.employerId;
            const p = await orderService.getPrivatePhone(targetId);
            setPhone(p);
        }
      }
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось загрузить детали заказа");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: OrderStatus) => {
    try {
      await orderService.updateStatus(orderId, status);
      setOrder({ ...order!, status });
      Alert.alert("Успех", "Статус обновлен");
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось обновить статус");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!order) return <View style={styles.center}><Text>Заказ не найден</Text></View>;

  const getStatusText = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return 'Ожидает мастеров';
      case 'accepted': return 'Мастер выбран';
      case 'started': return 'В работе';
      case 'finished': return 'Завершен';
      case 'completed': return 'Подтвержден';
      case 'cancelled': return 'Отменен';
      default: return status;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{order.title || order.address}</Text>
        <View style={styles.statusRow}>
            <View style={[styles.badge, { backgroundColor: COLORS.light }]}>
                <Text style={styles.status}>{getStatusText(order.status)}</Text>
            </View>
            <Text style={styles.price}>{order.price} ₽</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.infoItem}>
          <Ionicons name="location-outline" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>{order.address}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>{formatDate(order.date)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Описание</Text>
        <Text style={styles.details}>{order.details || 'Нет описания'}</Text>
      </View>

      {order.images && order.images.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Фотографии</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
            {order.images.map((img, i) => (
              <Image key={i} source={{ uri: img }} style={styles.image} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Заказчик</Text>
        <View style={styles.employerRow}>
          <View style={styles.avatar}>
            {employer?.avatar ? <Image source={{uri: employer.avatar}} style={styles.avatarImg} /> : <Ionicons name="person" size={24} color="#ccc" />}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.empName}>{employer?.name || 'Заказчик'}</Text>
            <Text style={styles.empRating}>Рейтинг: {employer?.rating ? (Number(employer.rating)*2).toFixed(1) : '10.0'}</Text>
          </View>
          {phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${phone}`)}>
              <Ionicons name="call" size={24} color={COLORS.success} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {currentRole === 'worker' && order.status === 'pending' && (
          <TouchableOpacity style={styles.mainBtn} onPress={() => orderService.applyForOrder(order.id, 'me')}>
            <Text style={styles.mainBtnText}>ОТКЛИКНУТЬСЯ</Text>
          </TouchableOpacity>
        )}

        {currentRole === 'worker' && order.workerId === auth.currentUser?.uid && (
            <>
                {order.status === 'accepted' && (
                    <TouchableOpacity style={[styles.mainBtn, {backgroundColor: COLORS.secondary}]} onPress={() => updateStatus('started')}>
                        <Text style={styles.mainBtnText}>ПРИСТУПИТЬ К РАБОТЕ</Text>
                    </TouchableOpacity>
                )}
                {order.status === 'started' && (
                    <TouchableOpacity style={[styles.mainBtn, {backgroundColor: COLORS.success}]} onPress={() => updateStatus('finished')}>
                        <Text style={styles.mainBtnText}>ВЫПОЛНИЛ</Text>
                    </TouchableOpacity>
                )}
            </>
        )}

        {currentRole === 'employer' && order.employerId === auth.currentUser?.uid && order.status === 'finished' && (
             <TouchableOpacity style={[styles.mainBtn, {backgroundColor: COLORS.primary}]} onPress={() => updateStatus('completed')}>
                <Text style={styles.mainBtnText}>ПОДТВЕРДИТЬ ВЫПОЛНЕНИЕ</Text>
            </TouchableOpacity>
        )}
      </View>
      <View style={{height: 50}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.dark },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  status: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary },
  price: { fontSize: 20, fontWeight: 'bold', color: COLORS.success },
  section: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark, marginBottom: 15 },
  infoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoText: { marginLeft: 10, fontSize: 15, color: COLORS.dark },
  details: { fontSize: 15, color: COLORS.gray, lineHeight: 22 },
  imageScroll: { flexDirection: 'row' },
  image: { width: 200, height: 150, borderRadius: 15, marginRight: 15 },
  employerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bgLight, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  empName: { fontSize: 16, fontWeight: 'bold' },
  empRating: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  actions: { padding: 20 },
  mainBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  mainBtnText: { color: '#fff', fontWeight: '800', letterSpacing: 1 }
});
