import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { formatDate } from '../utils/date';
import { apiService } from '../services/ApiService';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const response = await apiService.getOrderDetails(orderId);
      setOrder(response.data);
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось загрузить детали заказа");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      await apiService.updateOrderStatus(orderId, status);
      fetchOrder();
      Alert.alert("Успех", "Статус обновлен");
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось обновить статус");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!order) return <View style={styles.center}><Text>Заказ не найден</Text></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{order.title}</Text>
        <Text style={styles.price}>{order.price} ₽</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.infoText}>{order.address}</Text>
        <Text style={styles.infoText}>{formatDate(order.date)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Описание</Text>
        <Text style={styles.details}>{order.details || 'Нет описания'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Заказчик</Text>
        <View style={styles.employerRow}>
          <Text style={styles.empName}>{order.employer?.name || 'Заказчик'}</Text>
          <Text style={styles.empRating}>Рейтинг: {order.employer?.rating}</Text>
        </View>
      </View>

      <View style={styles.actions}>
          <TouchableOpacity style={styles.mainBtn} onPress={() => apiService.applyForOrder(order.id)}>
            <Text style={styles.mainBtnText}>ОТКЛИКНУТЬСЯ</Text>
          </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 24, fontWeight: '800' },
  price: { fontSize: 20, fontWeight: 'bold', color: COLORS.success, marginTop: 10 },
  section: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  infoText: { fontSize: 15, marginBottom: 5 },
  details: { fontSize: 15, color: COLORS.gray, lineHeight: 22 },
  employerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empName: { fontSize: 16, fontWeight: 'bold' },
  empRating: { fontSize: 14, color: COLORS.gray },
  actions: { padding: 20 },
  mainBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  mainBtnText: { color: '#fff', fontWeight: '800', letterSpacing: 1 }
});
