import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppInput } from '../components/Input';
import { orderService } from '../services/OrderService';

export default function CreateOrderScreen({ navigation }: any) {
  const [form, setForm] = useState({ address: '', price: '', details: '' });
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!form.address || !form.price) { Alert.alert("Ошибка", "Заполните все поля"); return; }
    setLoading(true);
    try {
      await orderService.createOrder(form);
      Alert.alert("Успех", "Заказ опубликован!");
      navigation.navigate('Map');
    } catch (e) { Alert.alert("Ошибка сохранения"); } 
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#EEF2FF' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Новый заказ</Text>
        <AppInput label="Адрес объекта" value={form.address} onChangeText={(t:any)=>setForm({...form, address:t})} />
        <AppInput label="Оплата (₽)" keyboardType="numeric" value={form.price} onChangeText={(t:any)=>setForm({...form, price:t})} />
        <AppInput label="Описание" multiline style={{height:120, textAlignVertical:'top'}} value={form.details} onChangeText={(t:any)=>setForm({...form, details:t})} />
        <TouchableOpacity style={{backgroundColor:'#5856D6', padding:18, borderRadius:12, alignItems:'center', marginTop:10}} onPress={handlePublish} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight:'bold'}}>ОПУБЛИКОВАТЬ</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}