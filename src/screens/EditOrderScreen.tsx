import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { AppInput } from '../components/Input';
import { apiService } from '../services/ApiService';
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
      const response = await apiService.getOrderDetails(orderId);
      const order = response.data;
      setForm({
        title: order.title || '',
        address: order.address || '',
        price: String(order.price || ''),
        details: order.details || '',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await apiService.updateOrderStatus(orderId, 'PENDING');
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сохранить");
    }
  };

  if (loading) return <ActivityIndicator style={{flex: 1}} />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <AppInput label="Заголовок" value={form.title} onChangeText={(t:any)=>setForm({...form, title:t})} />
        <TouchableOpacity style={styles.btn} onPress={handleSave}>
          <Text style={styles.btnText}>СОХРАНИТЬ</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  btn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
