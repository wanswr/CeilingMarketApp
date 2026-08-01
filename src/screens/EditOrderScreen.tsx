import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger/LoggerService';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { AppInput } from '../components/Input'
import { mapEngine } from '../services/MapEngine'
import { COLORS } from '../constants/theme'
import { apiService } from '../services/ApiService'

import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function EditOrderScreen({ navigation, route }: any) {
  const { orderId } = route.params;
  const [form, setForm] = useState({
    title: '',
    address: '',
    price: '',
    details: '',
    workType: 'INSTALLATION',
    categoryId: ''
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await apiService.getCategories();
        setCategories(res.data || []);
      } catch (err) {
        logger.error("FETCH_CATS_ERROR", { error: err });
      }
    };
    fetchCats();
  }, []);

  const fetchOrder = async () => {
    try {
      const order = await mapEngine.syncOrder(orderId);
      setForm({
        title: order.title || '',
        address: order.address || '',
        price: String(order.price || ''),
        details: order.details || '',
        workType: order.workType || 'INSTALLATION',
        categoryId: order.categoryId || ''
      });
    } catch (e) {
      logger.error("UI_ERROR", { error: e });
      Alert.alert("Ошибка", "Не удалось загрузить заказ");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await mapEngine.updateOrder(orderId, {
        ...form,
        price: Number(form.price)
      });
      Alert.alert("Успех", "Заказ обновлен");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сохранить");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Редактировать</Text>
          <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <AppInput label="Заголовок" value={form.title} onChangeText={(t:any)=>setForm({...form, title:t})} />

        <Text style={styles.label}>Категория заказа</Text>
        {categories.length > 0 ? (
          <View style={styles.workTypeGrid}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.workTypeBtn, form.categoryId === cat.id && styles.workTypeBtnActive]}
                onPress={() => {
                  setForm({ ...form, categoryId: cat.id });
                }}
              >
                <Text style={[styles.workTypeBtnText, form.categoryId === cat.id && styles.workTypeBtnTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginBottom: 15 }} />
        )}

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
              style={[styles.workTypeBtn, form.workType === type.id && styles.workTypeBtnActive]}
              onPress={() => setForm({ ...form, workType: type.id as any })}
            >
              <Text style={[styles.workTypeBtnText, form.workType === type.id && styles.workTypeBtnTextActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <AppInput label="Адрес" value={form.address} onChangeText={(t:any)=>setForm({...form, address:t})} />
        <AppInput label="Цена (₽)" value={form.price} keyboardType="numeric" onChangeText={(t:any)=>setForm({...form, price:t})} />
        <AppInput
            label="Детали"
            value={form.details}
            multiline
            style={{ height: 120, textAlignVertical: 'top' }}
            onChangeText={(t:any)=>setForm({...form, details:t})}
        />

        <TouchableOpacity style={styles.btn} onPress={handleSave}>
          <Text style={styles.btnText}>СОХРАНИТЬ ИЗМЕНЕНИЯ</Text>
        </TouchableOpacity>
      </ScrollView>
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
