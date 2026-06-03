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
  Image,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppInput } from '../components/Input';
import { orderService } from '../services/OrderService';
import { COLORS } from '../constants/theme';
import { formatDate } from '../utils/date';

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
  const [tempDate, setTempDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [coordinates, setCoordinates] = useState<{latitude: number, longitude: number} | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

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

  const handleGeocode = async () => {
    if (!form.address || form.address.length < 5) return;

    setIsGeocoding(true);
    try {
      // Adding regional context for better accuracy in Russia/Moscow
      const searchAddress = form.address.toLowerCase().includes('москва')
        ? form.address
        : `Москва, ${form.address}`;

      const geocoded = await Location.geocodeAsync(searchAddress);
      if (geocoded.length > 0) {
        setCoordinates({
          latitude: geocoded[0].latitude,
          longitude: geocoded[0].longitude,
        });
      }
    } catch (err) {
      console.warn("Geocoding failed:", err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нет доступа к местоположению');
      return;
    }

    setLoading(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setCoordinates(coords);

      // Reverse geocode to fill the address field
      const reverse = await Location.reverseGeocodeAsync(coords);
      if (reverse.length > 0) {
        const addr = reverse[0];
        const formatted = [addr.city, addr.street, addr.name].filter(Boolean).join(', ');
        setForm(f => ({ ...f, address: formatted }));
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось получить координаты');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!form.address || !form.price || !form.title) {
      Alert.alert("Ошибка", "Заполните основные поля (Заголовок, Адрес, Оплата)");
      return;
    }

    if (!coordinates) {
      Alert.alert("Ошибка", "Не удалось определить координаты адреса. Пожалуйста, проверьте адрес или используйте текущее местоположение.");
      return;
    }

    setLoading(true);
    try {
      // Upload images first
      let imageUrls: string[] = [];
      try {
        imageUrls = await Promise.all(
          images.map(uri => orderService.uploadImage(uri))
        );
      } catch (storageErr) {
        console.warn("Storage upload failed, proceeding without images:", storageErr);
        Alert.alert("Предупреждение", "Не удалось загрузить фотографии (проверьте подписку Firebase), заказ будет создан без них.");
      }

      const orderData = {
        ...form,
        date: form.date.toISOString(),
        images: imageUrls,
        coordinates: coordinates,
        location: coordinates, // Dual field for compatibility
      };

      console.log('Publishing order with location:', orderData.location);
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
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (selectedDate) {
        setForm({ ...form, date: selectedDate });
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const confirmIosDate = () => {
    setForm({ ...form, date: tempDate });
    setShowDatePicker(false);
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
              onBlur={handleGeocode}
              icon={<Ionicons name="location-outline" size={20} color={COLORS.primary} />}
            />

            <View style={styles.locationActions}>
              <TouchableOpacity style={styles.locationBtn} onPress={handleGeocode} disabled={isGeocoding}>
                {isGeocoding ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                  <>
                    <Ionicons name="search-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.locationBtnText}>Найти на карте</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.locationBtn} onPress={handleUseCurrentLocation}>
                <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
                <Text style={styles.locationBtnText}>Я на месте</Text>
              </TouchableOpacity>
            </View>

            {coordinates && (
              <View style={styles.mapPreviewContainer}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.mapPreview}
                  initialRegion={{
                    ...coordinates,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  onPress={(e) => setCoordinates(e.nativeEvent.coordinate)}
                >
                  <Marker
                    coordinate={coordinates}
                    draggable
                    onDragEnd={(e) => setCoordinates(e.nativeEvent.coordinate)}
                  />
                </MapView>
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapHint}>Можно двигать метку или нажать на карту</Text>
                </View>
              </View>
            )}

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
                  onPress={() => {
                    setTempDate(form.date);
                    setShowDatePicker(true);
                  }}
                >
                  <Ionicons name="calendar-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text>{formatDate(form.date)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* iOS Date Picker Modal */}
            {Platform.OS === 'ios' && (
              <Modal
                transparent={true}
                visible={showDatePicker}
                animationType="slide"
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={{color: COLORS.danger, fontWeight: '600'}}>Отмена</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={confirmIosDate}>
                        <Text style={{color: COLORS.primary, fontWeight: '600'}}>Готово</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={tempDate}
                      mode="date"
                      display="spinner"
                      onChange={onDateChange}
                      minimumDate={new Date()}
                      style={{ height: 216 }}
                      textColor={COLORS.dark}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {/* Android Date Picker */}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={form.date}
                mode="date"
                display="default"
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
  locationActions: {
    flexDirection: 'row',
    marginBottom: 15,
    marginTop: -10,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    padding: 5,
  },
  locationBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  mapPreviewContainer: {
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapPreview: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  mapHint: {
    fontSize: 10,
    color: COLORS.dark,
    fontWeight: '600',
  },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
});
