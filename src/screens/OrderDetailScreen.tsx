import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { OrderService, Order } from '../services/OrderService';
import { Button } from '../components/Button';
import { COLORS } from '../constants/theme';

const OrderDetailScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const data = await OrderService.getOrderById(orderId);
      setOrder(data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить данные заказа');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      await OrderService.applyForOrder(orderId);
      Alert.alert('Успех', 'Ваша заявка отправлена');
      fetchOrderDetails();
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отправить заявку');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{order.title}</Text>
        <Text style={styles.price}>{order.price} ₽</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Адрес:</Text>
          <Text style={styles.value}>{order.address}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Описание:</Text>
          <Text style={styles.value}>{order.details}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Заказчик:</Text>
          <Text style={styles.value}>{order.employer?.name || 'Аноним'}</Text>
        </View>

        {order.status === 'PENDING' && (
          <Button
            title="Откликнуться"
            onPress={handleApply}
            loading={submitting}
            style={styles.applyBtn}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  price: { fontSize: 22, color: COLORS.primary, fontWeight: 'bold', marginBottom: 20 },
  section: { marginBottom: 15 },
  label: { fontSize: 14, color: '#666', marginBottom: 5 },
  value: { fontSize: 16, color: '#333' },
  applyBtn: { marginTop: 30 }
});

export default OrderDetailScreen;
