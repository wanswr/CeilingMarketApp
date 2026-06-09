import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator, Platform, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { OrderService, Order } from '../services/OrderService';
import { Button } from '../components/Button';
import { COLORS, SHADOWS } from '../constants/theme';
import { formatDate } from '../utils/date';

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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageHeader}>
          {order.images?.length > 0 ? (
            <Image source={{ uri: order.images[0] }} style={styles.mainImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
               <Ionicons name="image-outline" size={64} color={COLORS.border} />
               <Text style={{ color: COLORS.placeholder, marginTop: 10, fontWeight: '600' }}>Фото не добавлено</Text>
            </View>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
             <BlurView intensity={80} tint="light" style={styles.backBtnBlur}>
                <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
             </BlurView>
          </TouchableOpacity>
        </View>

        <View style={styles.contentCard}>
          <View style={styles.priceRow}>
            <View style={styles.priceBadge}>
               <Text style={styles.priceText}>{order.price} ₽</Text>
            </View>
            <View style={styles.statusBadge}>
               <Text style={styles.statusText}>Срочно</Text>
            </View>
          </View>

          <Text style={styles.title}>{order.title}</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <Ionicons name="location" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Адрес</Text>
                 <Text style={styles.infoValue}>{order.address}</Text>
               </View>
            </View>

            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <Ionicons name="calendar" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Дата публикации</Text>
                 <Text style={styles.infoValue}>{formatDate(order.date)}</Text>
               </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Описание задачи</Text>
          <Text style={styles.description}>{order.details || 'Описание отсутствует'}</Text>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Заказчик</Text>
          <TouchableOpacity style={styles.employerCard} activeOpacity={0.7}>
            <View style={styles.avatar}>
               <Text style={styles.avatarText}>{(order.employer?.name || 'U')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
               <Text style={styles.employerName}>{order.employer?.name || 'Заказчик'}</Text>
               <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={COLORS.warning} />
                  <Text style={styles.ratingText}>{order.employer?.rating?.toFixed(1) || '5.0'}</Text>
                  <Text style={styles.ordersCount}>• {order.employer?.completedOrders || 0} завершено</Text>
               </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.placeholder} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BlurView intensity={90} tint="light" style={styles.footer}>
        <SafeAreaView edges={['bottom']}>
          {order.status === 'PENDING' ? (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.applyBtn}
              onPress={handleApply}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.applyBtnText}>Откликнуться на заказ</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.applyBtn, { backgroundColor: COLORS.gray, opacity: 0.5 }]}>
              <Text style={styles.applyBtnText}>Заказ не активен</Text>
            </View>
          )}
        </SafeAreaView>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  imageHeader: { height: 260, width: '100%', position: 'relative' },
  mainImage: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 10 },
  backBtnBlur: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  contentCard: {
    marginTop: -30,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    minHeight: 500
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  priceBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, ...SHADOWS.soft },
  priceText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  statusBadge: { backgroundColor: 'rgba(255, 71, 87, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusText: { color: COLORS.danger, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.dark, marginBottom: 24, lineHeight: 34, letterSpacing: -1 },
  infoGrid: { gap: 24 },
  infoItem: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', ...SHADOWS.soft },
  infoTextWrapper: { marginLeft: 16, flex: 1 },
  infoLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: COLORS.dark, fontWeight: '700', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 30 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginBottom: 16, letterSpacing: -0.5 },
  description: { fontSize: 16, color: COLORS.gray, lineHeight: 28, fontWeight: '500' },
  employerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 24,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)'
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  employerName: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingText: { fontSize: 14, fontWeight: '700', color: COLORS.dark, marginLeft: 4 },
  ordersCount: { fontSize: 14, color: COLORS.gray, marginLeft: 8, fontWeight: '500' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  applyBtn: {
    backgroundColor: COLORS.primary,
    height: 64,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3
  },
  applyBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }
});

export default OrderDetailScreen;
