import React, { useState } from 'react';
import { TouchableOpacity,
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Modal,
  TextInput,


TouchableOpacity,
} from 'react-native';
import { TouchableOpacity, SafeAreaView
} from 'react-native-safe-area-context';
import { TouchableOpacity, Ionicons
} from '@expo/vector-icons';
import { TouchableOpacity, BlurView
} from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, PROVIDER_GOOGLE
} from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TouchableOpacity, z
} from 'zod';
import { TouchableOpacity, AppInput
} from '../components/Input';
import { TouchableOpacity, Button
} from '../components/Button';
import { TouchableOpacity, mapEngine
} from '../services/MapEngine';
import { TouchableOpacity, COLORS, SHADOWS
} from '../constants/theme';
import { TouchableOpacity, formatDate
} from '../utils/date';
import i18n from '../constants/i18n';

const orderSchema = z.object({
  title: z.string().min(5, "Заголовок слишком короткий"),
  address: z.string().min(5, "Укажите полный адрес"),
  price: z.string().refine(v => !isNaN(Number(v)) && Number(v) > 0, "Укажите корректную сумму"),
  details: z.string().min(10, "Добавьте больше деталей"),
  workType: z.string().min(1, "Выберите тип работы"),
});

export default function CreateOrderScreen({ navigation }: any) {
  const [form, setForm] = useState({
    title: '',
    address: '',
    price: '',
    details: '',
    workType: 'INSTALLATION',
    date: new Date(),
  });
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [coordinates, setCoordinates] = useState<{latitude: number, longitude: number} | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [normalizedAddress, setNormalizedAddress] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errors, setErrors] = useState<any>({});

  const pickImage = async () => {
    const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libStatus !== 'granted') {
      Alert.alert('Доступ запрещен', 'Для выбора фото требуется разрешение на доступ к галерее. Вы можете включить его в настройках.');
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
    if (text.length > 2) {
      try {
        const queries = [
          text,
          `Москва, ${text}`,
          `Московская область, ${text}`
        ];

        let foundSuggestions: string[] = [];
        for (const q of queries) {
          const results = await Location.geocodeAsync(q);
          if (results.length > 0) {
            const rev = await Location.reverseGeocodeAsync({
              latitude: results[0].latitude,
              longitude: results[0].longitude
            });
            if (rev.length > 0) {
              const r = rev[0];
              const formatted = [r.city, r.street, r.name].filter(Boolean).join(', ');
              if (formatted && !foundSuggestions.includes(formatted)) {
                foundSuggestions.push(formatted);
              }
            }
          }
          if (foundSuggestions.length > 2) break;
        }
        setSuggestions(foundSuggestions);
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
        input,
        `Москва, ${input}`,
        `Московская область, ${input}`,
      ];

      let bestResult = null;

      for (const query of queries) {
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) {
          const res = results[0];
          if (res.latitude > 54 && res.latitude < 57 && res.longitude > 35 && res.longitude < 40) {
            bestResult = res;
            break;
          }
          if (!bestResult) bestResult = res;
        }
      }

      if (bestResult) {
        const newCoords = {
          latitude: bestResult.latitude,
          longitude: bestResult.longitude,
        };
        setCoordinates(newCoords);

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
    // Validation
    const validation = orderSchema.safeParse(form);
    if (!validation.success) {
      const fieldErrors: any = {};
      validation.error.errors.forEach(err => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      Alert.alert("Ошибка заполнения", "Пожалуйста, проверьте все поля.");
      return;
    }

    if (!coordinates) {
      Alert.alert("Ошибка", "Не удалось определить координаты адреса. Пожалуйста, проверьте адрес или используйте текущее местоположение.");
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      const orderData = {
        ...form,
        date: form.date.toISOString(),
        images: [],
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        price: Number(form.price),
        idempotencyKey: `${Date.now()}-${form.title}`,
      };

      await mapEngine.createOrder(orderData);

      Alert.alert("Успех", "Заказ опубликован!");
      navigation.navigate('Orders');
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

  const [parsedData, setParsedData] = useState<any>(null);

  const handleSmartImport = async () => {
    if (!importText.trim()) return;
    setIsParsing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const parsed = await mapEngine.parseOrderText(importText);
      setParsedData(parsed);
    } catch (error) {
      Alert.alert("Ошибка", "Не удалось распознать текст. Попробуйте ввести данные вручную.");
    } finally {
      setIsParsing(false);
    }
  };

  const applyParsedData = () => {
    if (!parsedData) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setForm({
      ...form,
      title: parsedData.title || form.title,
      address: parsedData.address || form.address,
      price: parsedData.price ? String(parsedData.price) : form.price,
      details: parsedData.details || form.details,
      date: parsedData.date ? new Date(parsedData.date) : form.date,
    });

    if (parsedData.address) {
      handleGeocode(parsedData.address);
    }

    setParsedData(null);
    setImportText('');
    setIsImportModalVisible(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={styles.title}>{i18n.t('orders.new')}</Text>
                  <Text style={styles.subtitle}>Опишите задачу максимально подробно</Text>
                </View>
                <TouchableOpacity
                    style={styles.magicBtn}
                    onPress={() => setIsImportModalVisible(true)}
                >
                    <Ionicons name="sparkles" size={20} color="#fff" />
                    <Text style={styles.magicBtnText}>Импорт</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Основная информация</Text>

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
                    onPress={() => setForm({ ...form, workType: type.id })}
                  >
                    <Text style={[styles.workTypeBtnText, form.workType === type.id && styles.workTypeBtnTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <AppInput
                label={i18n.t('orders.title')}
                placeholder={i18n.t('orders.titlePlaceholder')}
                value={form.title}
                onChangeText={(t:any)=>setForm({...form, title:t})}
                error={errors.title}
              />

              <AppInput
                label={i18n.t('orders.details')}
                placeholder={i18n.t('orders.detailsPlaceholder')}
                multiline
                style={{height: 100, textAlignVertical: 'top'}}
                value={form.details}
                onChangeText={(t:any)=>setForm({...form, details:t})}
                error={errors.details}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{i18n.t('orders.location')}</Text>
              <View style={{ position: 'relative' }}>
                <AppInput
                  label={i18n.t('orders.address')}
                  placeholder="Улица, дом..."
                  value={form.address}
                  onChangeText={handleAddressChange}
                  onBlur={() => handleGeocode()}
                  icon={<Ionicons name="location-outline" size={20} color={COLORS.primary} />}
                  error={errors.address}
                />
                {form.address.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => { setForm({...form, address: ''}); setSuggestions([]); setCoordinates(null); }}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
              </View>

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
                      <Text style={styles.locationBtnText}>Найти</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.locationBtn} onPress={handleUseCurrentLocation}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.locationBtnText}>Местоположение</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mapPreviewContainer}>
                <MapView
                  ref={mapRef}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
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
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Условия</Text>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <AppInput
                    label={i18n.t('orders.price')}
                    keyboardType="numeric"
                    value={form.price}
                    onChangeText={(t:any)=>setForm({...form, price:t})}
                    error={errors.price}
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.label}>{i18n.t('orders.date')}</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.dateButton}
                    onPress={() => {
                      setTempDate(form.date);
                      setShowDatePicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.dateText}>{formatDate(form.date)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.publishButton, loading && { opacity: 0.7 }]}
              onPress={handlePublish}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publishText}>{i18n.t('orders.publish')}</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        </TouchableWithoutFeedback>

        <Modal
            visible={isImportModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setIsImportModalVisible(false)}
        >
            <BlurView intensity={30} style={StyleSheet.absoluteFill}>
                <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={1}
                    onPress={() => setIsImportModalVisible(false)}
                />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalIconContainer}>
                                <Ionicons name="sparkles" size={24} color={COLORS.primary} />
                            </View>
                            <Text style={styles.modalTitle}>Умный импорт</Text>
                            <TouchableOpacity onPress={() => setIsImportModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={COLORS.gray} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Вставьте текст сообщения из WhatsApp или Telegram. Мы автоматически заполним форму.
                        </Text>

                        {!parsedData ? (
                            <>
                                <TextInput
                                    style={styles.importInput}
                                    placeholder="На субботу 13.06... ул. Удальцова 12... 6000р"
                                    placeholderTextColor={COLORS.gray}
                                    multiline
                                    value={importText}
                                    onChangeText={setImportText}
                                    autoFocus
                                />

                                <TouchableOpacity
                                    style={[styles.importSubmitBtn, !importText.trim() && { opacity: 0.5 }]}
                                    onPress={handleSmartImport}
                                    disabled={!importText.trim() || isParsing}
                                >
                                    {isParsing ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="flash" size={20} color="#fff" />
                                            <Text style={styles.importSubmitText}>Анализировать текст</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={styles.previewContainer}>
                                <Text style={styles.previewHeading}>Вот что я нашел:</Text>
                                <View style={styles.previewItem}>
                                        <View style={styles.previewIconWrapper}>
                                            <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
                                        </View>
                                        <View style={styles.previewTextColumn}>
                                            <Text style={styles.previewLabel}>Заголовок</Text>
                                            <Text style={styles.previewText} numberOfLines={1}>{parsedData.title}</Text>
                                        </View>
                                </View>
                                <View style={styles.previewItem}>
                                        <View style={styles.previewIconWrapper}>
                                            <Ionicons name="location-outline" size={18} color={COLORS.primary} />
                                        </View>
                                        <View style={styles.previewTextColumn}>
                                            <Text style={styles.previewLabel}>Адрес</Text>
                                            <Text style={styles.previewText} numberOfLines={1}>{parsedData.address || 'Адрес не найден'}</Text>
                                        </View>
                                </View>
                                <View style={styles.previewItem}>
                                        <View style={styles.previewIconWrapper}>
                                            <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
                                        </View>
                                        <View style={styles.previewTextColumn}>
                                            <Text style={styles.previewLabel}>Бюджет</Text>
                                            <Text style={styles.previewText}>{parsedData.price} ₽</Text>
                                        </View>
                                </View>
                                <View style={styles.previewItem}>
                                        <View style={styles.previewIconWrapper}>
                                            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                                        </View>
                                        <View style={styles.previewTextColumn}>
                                            <Text style={styles.previewLabel}>Дата</Text>
                                            <Text style={styles.previewText}>{formatDate(new Date(parsedData.date))}</Text>
                                        </View>
                                </View>

                                <View style={styles.previewActions}>
                                    <TouchableOpacity
                                        style={styles.previewBackBtn}
                                        onPress={() => setParsedData(null)}
                                    >
                                        <Text style={styles.previewBackText}>Назад</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.previewApplyBtn}
                                        onPress={applyParsedData}
                                    >
                                        <Text style={styles.previewApplyText}>Применить</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </BlurView>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 30 },
  title: { fontSize: 32, fontWeight: '900', color: COLORS.dark, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: COLORS.gray, marginTop: 8, fontWeight: '500' },
  magicBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    ...SHADOWS.medium,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  magicBtnText: { color: '#fff', fontWeight: '800', marginLeft: 6, fontSize: 13 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)'
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 20, letterSpacing: -0.5 },
  clearBtn: { position: 'absolute', right: 15, top: 42, zIndex: 10 },
  suggestionsContainer: {
    backgroundColor: '#fff',
    marginTop: -10,
    marginBottom: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.medium
  },
  suggestionItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center'
  },
  suggestionText: { fontSize: 14, color: COLORS.dark, marginLeft: 10, fontWeight: '500' },
  locationActions: { flexDirection: 'row', marginBottom: 20, marginTop: -5 },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    backgroundColor: 'rgba(45, 91, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12
  },
  locationBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700', marginLeft: 6 },
  mapPreviewContainer: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border
  },
  mapPreview: { width: '100%', height: '100%' },
  label: { fontSize: 14, fontWeight: '800', color: COLORS.dark, marginBottom: 10, marginLeft: 4 },
  workTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  workTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  workTypeBtnActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  workTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  workTypeBtnTextActive: {
    color: COLORS.primary,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    height: 58,
    paddingHorizontal: 15
  },
  dateText: { fontSize: 15, color: COLORS.dark, fontWeight: '600' },
  publishButton: {
    backgroundColor: COLORS.primary,
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
    ...SHADOWS.medium,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3
  },
  publishText: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 0.5 },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    ...SHADOWS.heavy
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  modalIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(45, 91, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.dark, flex: 1, marginLeft: 15 },
  modalSubtitle: { fontSize: 15, color: COLORS.gray, lineHeight: 22, marginBottom: 20, fontWeight: '500' },
  importInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    height: 160,
    textAlignVertical: 'top',
    fontSize: 16,
    color: COLORS.dark,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24
  },
  importSubmitBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 18,
    ...SHADOWS.medium
  },
  importSubmitText: { color: '#fff', fontWeight: '900', fontSize: 16, marginLeft: 10 },
  previewContainer: {
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(45, 91, 255, 0.1)'
  },
  previewHeading: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 15 },
  previewItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  previewIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  previewTextColumn: { flex: 1 },
  previewLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray, textTransform: 'uppercase', marginBottom: 2 },
  previewText: { fontSize: 15, color: COLORS.dark, fontWeight: '700' },
  previewActions: { flexDirection: 'row', marginTop: 15 },
  previewBackBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  previewBackText: { color: COLORS.gray, fontWeight: '700' },
  previewApplyBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 14,
    ...SHADOWS.medium
  },
  previewApplyText: { color: '#fff', fontWeight: '900' }
});
