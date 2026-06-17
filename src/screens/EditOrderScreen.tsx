import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { AppInput } from '../components/Input';
import { mapEngine } from '../services/MapEngine';
import { COLORS } from '../constants/theme';

export default function EditOrderScreen({ navigation, route }: any) {
  const { orderId } = route.params;
  const [form, setForm] = useState({ title: '', address: '', price: '', details: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const order = await mapEngine.syncOrder(orderId);
      setForm({
        title: order.title || '',
        address: order.address || '',
        price: String(order.price || ''),
        details: order.details || '',
      });
    } catch (e) {
      console.error(e);
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <AppInput label="Заголовок" value={form.title} onChangeText={(t:any)=>setForm({...form, title:t})} />
        <AppInput label="Адрес" value={form.address} onChangeText={(t:any)=>setForm({...form, address:t})} />
        <AppInput label="Цена" value={form.price} keyboardType="numeric" onChangeText={(t:any)=>setForm({...form, price:t})} />
        <AppInput label="Детали" value={form.details} multiline onChangeText={(t:any)=>setForm({...form, details:t})} />

        <TouchableOpacity style={styles.btn} onPress={handleSave}>
          <Text style={styles.btnText}>СОХРАНИТЬ</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
