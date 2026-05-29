import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppInput } from '../components/Input';
import { orderService } from '../services/OrderService';
import { COLORS } from '../constants/theme';

export default function CreateOrderScreen({ navigation }: any) {
  const [form, setForm] = useState({ address: '', price: '', details: '' });
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pickImages = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 5,
    });

    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setImages([...images, ...uris].slice(0, 5));
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (!form.address || !form.price) { Alert.alert("Ошибка", "Заполните все поля"); return; }
    setLoading(true);
    try {
      await orderService.createOrder({ ...form, images });
      Alert.alert("Успех", "Заказ опубликован!");
      navigation.navigate('Map');
    } catch (e) { Alert.alert("Ошибка сохранения"); } 
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Новый заказ</Text>

        <Text style={styles.label}>Фотографии объекта (до 5 шт.)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
          <TouchableOpacity style={styles.addCard} onPress={pickImages}>
            <Ionicons name="add" size={30} color={COLORS.gray} />
          </TouchableOpacity>
          {images.map((uri, index) => (
            <View key={index} style={styles.imageCard}>
              <Image source={{ uri }} style={styles.image} />
              <TouchableOpacity style={styles.removeBadge} onPress={() => removeImage(index)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <AppInput label="Адрес объекта" value={form.address} onChangeText={(t:any)=>setForm({...form, address:t})} />
        <AppInput label="Оплата (₽)" keyboardType="numeric" value={form.price} onChangeText={(t:any)=>setForm({...form, price:t})} />
        <AppInput label="Описание" multiline style={{height:120, textAlignVertical:'top'}} value={form.details} onChangeText={(t:any)=>setForm({...form, details:t})} />

        <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>ОПУБЛИКОВАТЬ</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: COLORS.gray, marginBottom: 10, fontWeight: '600' },
  imageScroll: { flexDirection: 'row', marginBottom: 20 },
  addCard: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#e9ecef', justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#adb5bd', marginRight: 10 },
  imageCard: { width: 80, height: 80, borderRadius: 12, marginRight: 10, position: 'relative' },
  image: { width: '100%', height: '100%', borderRadius: 12 },
  removeBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  publishBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20, elevation: 2, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  publishText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
