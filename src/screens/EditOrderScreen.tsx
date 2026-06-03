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

export default function EditOrderScreen({ navigation, route }: any) {
  const { orderId } = route.params;
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
  const [normalizedAddress, setNormalizedAddress] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  React.useEffect(() => {
    const order = orderService.getOrders().find(o => o.id === orderId);
    if (order) {
      setForm({
        title: order.title || '',
        address: order.address || '',
        price: String(order.price || ''),
        details: order.details || '',
        date: order.date ? new Date(order.date) : new Date(),
      });
      setImages(order.images || []);
      const coord = order.coordinates || order.location;
      if (coord) {
        setCoordinates({
          latitude: Number(coord.latitude),
          longitude: Number(coord.longitude)
        });
      }
    }
  }, [orderId]);

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

  const mapRef = React.useRef<MapView>(null);

  const handleAddressChange = async (text: string) => {
    setForm({ ...form, address: text });
    if (text.length > 3) {
      try {
        const query = text.toLowerCase().includes('москва') ? text : `Москва, ${text}`;
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) {
          const rev = await Location.reverseGeocodeAsync({
            latitude: results[0].latitude,
            longitude: results[0].longitude
          });
          if (rev.length > 0) {
            const r = rev[0];
            const formatted = [r.city, r.street, r.name].filter(Boolean).join(', ');
            // Simple logic: if formatted address starts with user input, suggest it
            if (formatted && !suggestions.includes(formatted)) {
              setSuggestions([formatted]);
            }
          }
        }
      } catch (e) {}
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (addr: string) => {
    setForm({ ...form, address: addr });
    setSuggestions([]);
    handleGeocode(addr);
  };

  const handleGeocode = async (overrideAddr?: string) => {
    const addrToUse = overrideAddr || form.address;
    if (!addrToUse || addrToUse.length < 3) return;

    setIsGeocoding(true);
    try {
      const input = addrToUse.trim();
      const queries = [
        input, // Try exactly what user wrote
        `Москва, ${input}`, // Try Moscow prefix
        `Московская область, ${input}`, // Try Region prefix
      ];

      let bestResult = null;

      for (const query of queries) {
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) {
          // Check if the result is actually in the Moscow region (roughly)
          // Lat: 54-57, Lng: 35-40
          const res = results[0];
          if (res.latitude > 54 && res.latitude < 57 && res.longitude > 35 && res.longitude < 40) {
            bestResult = res;
            break;
          }
          // If not in Moscow region, still keep it as fallback if it's the first result
          if (!bestResult) bestResult = res;
        }
      }

      if (bestResult) {
        const newCoords = {
          latitude: bestResult.latitude,
          longitude: bestResult.longitude,
        };
        setCoordinates(newCoords);

        // Reverse geocode to show "Normalized" address
        try {
          const rev = await Location.reverseGeocodeAsync(newCoords);
          if (rev.length > 0) {
            const r = rev[0];
            const normalized = [r.city, r.street, r.name].filter(Boolean).join(', ');
            setNormalizedAddress(normalized);
          } else {
            setNormalizedAddress(null);
          }
        } catch (e) {
          setNormalizedAddress(null);
        }

        if (mapRef.current) {
          mapRef.current.animateToRegion({
            ...newCoords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
      } else {
        Alert.alert("Адрес не найден", "Попробуйте уточнить город или район, либо поставьте метку на карте вручную.");
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
      // Handle images: some might be URLs, some might be new URIs
      const newImages = images.filter(img => !img.startsWith('http'));
      const oldImages = images.filter(img => img.startsWith('http'));

      let uploadedUrls: string[] = [];
      if (newImages.length > 0) {
        try {
          uploadedUrls = await Promise.all(
            newImages.map(uri => orderService.uploadImage(uri))
          );
        } catch (storageErr) {
          console.warn("Storage upload failed for new images:", storageErr);
        }
      }

      const orderData = {
        ...form,
        date: form.date.toISOString(),
        images: [...oldImages, ...uploadedUrls],
        coordinates: coordinates,
        location: coordinates,
      };

      await orderService.updateOrder(orderId, orderData);
      Alert.alert("Успех", "Заказ обновлен!");
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
            <Text style={styles.title}>Редактировать заказ</Text>

            <AppInput
              label="Заголовок"
              placeholder="Напр: Монтаж потолка 20м2"
              value={form.title}
              onChangeText={(t)=>setForm({...form, title:t})}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Местоположение</Text>
              <AppInput
                label="Адрес объекта"
                placeholder="Улица, дом..."
                value={form.address}
                onChangeText={handleAddressChange}
                onBlur={() => handleGeocode()}
                icon={<Ionicons name="location-outline" size={20} color={COLORS.primary} />}
              />

              {suggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {suggestions.map((s, i) => (
                    <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => selectSuggestion(s)}>
                      <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.locationActions}>
                <TouchableOpacity style={styles.locationBtn} onPress={() => handleGeocode()} disabled={isGeocoding}>
                  {isGeocoding ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                    <>
                      <Ionicons name="search-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.locationBtnText}>Найти адрес</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.locationBtn} onPress={handleUseCurrentLocation}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.locationBtnText}>Моё местоположение</Text>
                </TouchableOpacity>
              </View>

              {normalizedAddress && (
                <View style={styles.normalizedContainer}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.normalizedText}>Найдено: {normalizedAddress}</Text>
                </View>
              )}

              <View style={styles.mapPreviewContainer}>
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={styles.mapPreview}
                  initialRegion={{
                    latitude: coordinates?.latitude || 55.751244,
                    longitude: coordinates?.longitude || 37.618423,
                    latitudeDelta: 0.1,
                    longitudeDelta: 0.1,
                  }}
                  onPress={(e) => setCoordinates(e.nativeEvent.coordinate)}
                >
                  {coordinates && (
                    <Marker
                      coordinate={coordinates}
                      draggable
                      onDragEnd={(e) => setCoordinates(e.nativeEvent.coordinate)}
                      pinColor={COLORS.primary}
                    />
                  )}
                </MapView>
                <View style={styles.mapInstruction}>
                  <Ionicons name="information-circle-outline" size={14} color="#666" />
                  <Text style={styles.mapHint}>
                    {coordinates
                      ? "Уточните положение, передвинув синюю метку"
                      : "Нажмите на карту, чтобы поставить метку вручную"}
                  </Text>
                </View>
              </View>
            </View>

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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>СОХРАНИТЬ</Text>}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  suggestionsContainer: {
    backgroundColor: '#fff',
    marginTop: -15,
    marginBottom: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 1000,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.dark,
    marginLeft: 8,
  },
  normalizedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FFF4',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  normalizedText: {
    fontSize: 13,
    color: '#2F855A',
    marginLeft: 6,
    fontWeight: '500',
  },
  section: {
    marginBottom: 25,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginBottom: 15,
  },
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
  mapInstruction: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  mapHint: {
    fontSize: 12,
    color: '#444',
    fontWeight: '500',
    marginLeft: 6,
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
