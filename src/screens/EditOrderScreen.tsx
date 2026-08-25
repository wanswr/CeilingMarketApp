import { maskPhoneNumbers } from '../utils/security';
import AppIcon from '../components/AppIcon';
import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger/LoggerService';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { AppInput } from '../components/Input'
import { mapEngine } from '../services/MapEngine'
import { COLORS } from '../constants/theme'

import { SafeAreaView } from 'react-native-safe-area-context'

export default function EditOrderScreen({ navigation, route }: any) {
  const { orderId } = route.params;
  const [form, setForm] = useState({
    title: '',
    address: '',
    price: '',
    details: '',
    workType: 'INSTALLATION'
  });
  const [loading, setLoading] = useState(true);
  const [initialOrder, setInitialOrder] = useState<any>(null);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const order = await mapEngine.syncOrder(orderId);
      setInitialOrder(order);
      setForm({
        title: order.title || '',
        address: order.address || '',
        price: String(order.price || ''),
        details: order.details || '',
        workType: order.workType || 'INSTALLATION'
      });
    } catch (e) {
      logger.error("UI_ERROR", { error: e });
      Alert.alert("Ошибка", "Не удалось загрузить заказ");
    } finally {
      setLoading(false);
    }
  };

  const isClaimed = initialOrder?.status === 'CLAIMED';
  const isInProgress = initialOrder?.status === 'IN_PROGRESS';
  const isTerminal = ['COMPLETED', 'REVIEWED', 'CANCELLED', 'FROZEN', 'DISPUTE'].includes(initialOrder?.status);

  const handleSave = async () => {
    if (isTerminal) {
      Alert.alert("Ошибка", "Заказ в текущем статусе нельзя редактировать.");
      return;
    }

    try {
      await mapEngine.updateOrder(orderId, {
        ...form,
        title: form.title ? maskPhoneNumbers(form.title) : "",
        details: form.details ? maskPhoneNumbers(form.details) : "",
        price: Number(form.price)
      });
      Alert.alert("Успех", "Заказ обновлен");
      navigation.goBack();
    } catch (e: any) {
      const serverMessage = e.response?.data?.message || e.message || "Не удалось сохранить";
      Alert.alert("Ошибка редактирования", serverMessage);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
              <AppIcon name="nav-back" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Редактировать</Text>
          <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
        {isClaimed && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>
              Исполнитель выбран. Изменение цены, адреса и ключевых условий заблокировано.
            </Text>
          </View>
        )}

        {isInProgress && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>
              Работа по заказу уже началась. Редактирование заблокировано.
            </Text>
          </View>
        )}

        <AppInput
          label="Заголовок"
          value={form.title}
          disabled={isInProgress || isTerminal}
          onChangeText={(t:any)=>setForm({...form, title:t})}
        />

        <Text style={styles.label}>Тип работы</Text>
        <View style={styles.workTypeGrid}>
          {[
            { id: 'INSTALLATION', label: 'Монтаж' },
            { id: 'SERVICE', label: 'Сервис' },
            { id: 'FROZE', label: 'Замер' },
            { id: 'REPAIR', label: 'Ремонт' },
            { id: 'OTHER', label: 'Другое' }
          ].map(type => (
            <TouchableOpacity
              key={type.id}
              disabled={isClaimed || isInProgress || isTerminal}
              style={[
                styles.workTypeBtn,
                form.workType === type.id && styles.workTypeBtnActive,
                (isClaimed || isInProgress || isTerminal) && { opacity: 0.5 }
              ]}
              onPress={() => setForm({ ...form, workType: type.id as any })}
            >
              <Text style={[styles.workTypeBtnText, form.workType === type.id && styles.workTypeBtnTextActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <AppInput
          label="Адрес"
          value={form.address}
          disabled={isClaimed || isInProgress || isTerminal}
          onChangeText={(t:any)=>setForm({...form, address:t})}
        />
        <AppInput
          label="Цена (₽)"
          value={form.price}
          keyboardType="numeric"
          disabled={isClaimed || isInProgress || isTerminal}
          onChangeText={(t:any)=>setForm({...form, price:t})}
        />
        <AppInput
            label="Детали"
            value={form.details}
            multiline
            disabled={isInProgress || isTerminal}
            style={{ height: 120, textAlignVertical: 'top' }}
            onChangeText={(t:any)=>setForm({...form, details:t})}
        />

        {!isInProgress && !isTerminal && (
          <TouchableOpacity style={styles.btn} onPress={handleSave}>
            <Text style={styles.btnText}>СОХРАНИТЬ ИЗМЕНЕНИЯ</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9' },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark },
  warningBanner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B'
  },
  warningBannerText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600'
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 10,
    marginTop: 10 },
  workTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20 },
  workTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9' },
  workTypeBtnActive: {
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1,
    borderColor: COLORS.primary },
  workTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray },
  workTypeBtnTextActive: {
    color: COLORS.primary,
    fontWeight: '700' },
  btn: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 30,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 }
});
