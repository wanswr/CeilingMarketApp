import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppInput } from '../components/Input';
import { orderService } from '../services/OrderService';
import { COLORS } from '../constants/theme';

export default function CreateOrderScreen({ navigation }: any) {
  const [form, setForm] = useState({
    title: '',
    address: '',
    price: '',
    details: '',
    date: new Date(),
  });
  const [images, setImages] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужен доступ к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (!form.address || !form.price || !form.title) {
      Alert.alert("Ошибка", "Заполните основные поля (Заголовок, Адрес, Оплата)");
      return;
    }

    setLoading(true);
    try {
      // Upload images first
      const imageUrls = await Promise.all(
        images.map(uri => orderService.uploadImage(uri))
      );

      const orderData = {
        ...form,
        date: form.date.toISOString(),
        images: imageUrls,
      };

      await orderService.createOrder(orderData);
      Alert.alert("Успех", "Заказ опубликован!");
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Ошибка сохранения", e.message || "Произошла неизвестная ошибка");
    }
    finally { setLoading(false); }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setForm({ ...form, date: selectedDate });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bgLight }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Новый заказ</Text>

            <AppInput
              label="Заголовок"
              placeholder="Напр: Монтаж потолка 20м2"
              value={form.title}
              onChangeText={(t)=>setForm({...form, title:t})}
            />

            <AppInput
              label="Адрес объекта"
              placeholder="Улица, дом..."
              value={form.address}
              onChangeText={(t)=>setForm({...form, address:t})}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <AppInput
                  label="Оплата (₽)"
                  keyboardType="numeric"
                  value={form.price}
                  onChangeText={(t)=>setForm({...form, price:t})}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Дата</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text>{form.date.toLocaleDateString()}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={form.date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}

            <AppInput
              label="Описание"
              placeholder="Дополнительные детали..."
              multiline
              style={{height: 100, textAlignVertical: 'top'}}
              value={form.details}
              onChangeText={(t)=>setForm({...form, details:t})}
            />

            <Text style={styles.label}>Фотографии</Text>
            <View style={styles.imageContainer}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.image} />
                  <TouchableOpacity
                    style={styles.removeImage}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 5 && (
                <TouchableOpacity style={styles.addImage} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={32} color={COLORS.gray} />
                  <Text style={{ fontSize: 12, color: COLORS.gray, marginTop: 4 }}>Добавить</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.publishButton, loading && { opacity: 0.7 }]}
              onPress={handlePublish}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>ОПУБЛИКОВАТЬ</Text>}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    height: 58,
    paddingHorizontal: 15,
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  imageWrapper: {
    width: 80,
    height: 80,
    marginRight: 10,
    marginBottom: 10,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeImage: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  addImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  publishButton: {
    backgroundColor: COLORS.secondary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  publishText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
});
