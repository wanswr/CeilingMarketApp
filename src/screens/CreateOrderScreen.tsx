import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger/LoggerService';

import {
  TouchableOpacity,
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
  TextInput
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, PROVIDER_GOOGLE
} from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import { z } from 'zod'
import { AppInput } from '../components/Input'
import { Button } from '../components/Button'
import { mapEngine } from '../services/MapEngine'
import { COLORS, SHADOWS } from '../constants/theme'
import { formatDate } from '../utils/date'
import i18n from '../constants/i18n';
import { usePendingAction } from '../context/PendingActionContext';
import { apiService } from '../services/ApiService';

const orderSchema = z.object({
  title: z.string().min(5, "Заголовок слишком короткий"),
  address: z.string().min(5, "Укажите полный адрес"),
  price: z.string().refine(v => !isNaN(Number(v)) && Number(v) > 0, "Укажите корректную сумму"),
  details: z.string().min(10, "Добавьте больше деталей"),
  workType: z.string().min(1, "Выберите тип работы") });

export default function CreateOrderScreen({ navigation }: any) {
  const route = useRoute<any>();
  const [form, setForm] = useState({
    title: '',
    address: '',
    price: '',
    details: '',
    workType: 'INSTALLATION',
    date: new Date() });
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
  const { requireRoleAndCategory } = usePendingAction();
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await apiService.getCategories();
        setCategories(res.data || []);
      } catch (err) {}
    };
    fetchCats();
  }, []);

  useEffect(() => {
    if (route.params?.latitude && route.params?.longitude) {
        const { latitude, longitude } = route.params;
        setCoordinates({ latitude, longitude });

        // Try to reverse geocode the selected point
        (async () => {
            try {
                const results = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (results.length > 0) {
                    const r = results[0];
                    const addr = [r.city, r.street, r.name].filter(Boolean).join(', ');
                    if (addr) {
                        setForm(f => ({ ...f, address: addr }));
                        setNormalizedAddress(addr);
                    }
                }
            } catch (e) {
                logger.error("GEOCODE_ERROR", { error: e });
            }
        })();
    }
  }, [route.params]);

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
      quality: 0.7 });

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
        }
      }

      if (bestResult) {
        setCoordinates({ latitude: bestResult.latitude, longitude: bestResult.longitude });
        const rev = await Location.reverseGeocodeAsync({
          latitude: bestResult.latitude,
          longitude: bestResult.longitude
        });
        if (rev.length > 0) {
          const r = rev[0];
          const formatted = [r.city, r.street, r.name].filter(Boolean).join(', ');
          setNormalizedAddress(formatted);
        }
      }
    } catch (e) {} finally {
      setIsGeocoding(false);
    }
  };

  const handlePublish = async () => {
    requireRoleAndCategory(async () => {
      if (loading) return;
      try {
        orderSchema.parse(form);
        if (!coordinates) {
          Alert.alert('Адрес не найден', 'Пожалуйста, укажите корректный адрес, чтобы мы могли найти его на карте.');
          return;
        }

        setLoading(true);
        await mapEngine.createOrder({
          ...form,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          price: Number(form.price),
          images: [],
          categoryId: selectedCategoryId || undefined,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Успех', 'Заказ успешно опубликован!', [
          { text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Map' }) }
        ]);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          const newErrors: any = {};
          err.errors.forEach(e => {
            newErrors[e.path[0]] = e.message;
          });
          setErrors(newErrors);
        } else {
          Alert.alert('Ошибка', 'Не удалось опубликовать заказ. Попробуйте позже.');
        }
      } finally {
        setLoading(false);
      }
    });
  };

  const handleImport = async () => {
    if (!importText.trim()) return;

    setIsParsing(true);
    try {
      const data = await mapEngine.parseOrderText(importText);
      setParsedData(data);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось распознать текст заказа');
    } finally {
      setIsParsing(false);
    }
  };

  const [parsedData, setParsedData] = useState<any>(null);

  const applyParsedData = () => {
    if (parsedData) {
      setForm({
        ...form,
        title: parsedData.title || '',
        address: parsedData.address || '',
        price: parsedData.price ? parsedData.price.toString() : '',
        details: parsedData.details || '',
        date: parsedData.date ? new Date(parsedData.date) : new Date()
      });
      if (parsedData.address) {
          handleGeocode(parsedData.address);
      }
      setParsedData(null);
      setIsImportModalVisible(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                    <Text style={styles.title}>Новый заказ</Text>
                    <Text style={styles.subtitle}>Опишите работу детально</Text>
                </View>
                <TouchableOpacity
                    style={styles.magicBtn}
                    onPress={() => setIsImportModalVisible(true)}
                >
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text style={styles.magicBtnText}>Импорт</Text>
                </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Основная информация</Text>

            <AppInput
              label="Что нужно сделать?"
              placeholder="Напр: Монтаж 2-х уровней + световая линия"
              value={form.title}
              onChangeText={(t) => setForm({ ...form, title: t })}
              error={errors.title}
            />

            <View>
                <AppInput
                  label="Адрес проведения работ"
                  placeholder="Город, улица, дом..."
                  value={form.address}
                  onChangeText={handleAddressChange}
                  error={errors.address}
                />
                {form.address.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                        setForm({ ...form, address: '' });
                        setCoordinates(null);
                        setNormalizedAddress(null);
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionItem}
                    onPress={() => selectSuggestion(s)}
                  >
                    <Ionicons name="location-sharp" size={16} color={COLORS.primary} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.locationActions}>
                {isGeocoding ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                ) : coordinates && (
                    <View style={styles.locationBtn}>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                        <Text style={styles.locationBtnText}>Точка установлена</Text>
                    </View>
                )}
            </View>

            <View style={styles.mapPreviewContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.mapPreview}
                    region={coordinates ? {
                        ...coordinates,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01
                    } : {
                        latitude: 55.751244,
                        longitude: 37.618423,
                        latitudeDelta: 0.1,
                        longitudeDelta: 0.1
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                >
                    {coordinates && <Marker coordinate={coordinates} />}
                </MapView>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Детали заказа</Text>

            <Text style={styles.label}>Тип работ</Text>
            <View style={styles.workTypeGrid}>
                {['INSTALLATION', 'FROZE', 'REPAIR', 'SERVICE', 'OTHER'].map((type) => (
                    <TouchableOpacity
                        key={type}
                        style={[styles.workTypeBtn, form.workType === type && styles.workTypeBtnActive]}
                        onPress={() => setForm({ ...form, workType: type })}
                    >
                        <Text style={[styles.workTypeBtnText, form.workType === type && styles.workTypeBtnTextActive]}>
                            {i18n.t(`workTypes.${type}`)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {categories.length > 0 && (
              <>
                <Text style={styles.label}>Направление (опционально)</Text>
                <View style={styles.workTypeGrid}>
                    {categories.map((cat) => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[styles.workTypeBtn, selectedCategoryId === cat.id && styles.workTypeBtnActive]}
                            onPress={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                        >
                            <Text style={[styles.workTypeBtnText, selectedCategoryId === cat.id && styles.workTypeBtnTextActive]}>
                                {cat.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
              </>
            )}

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 15 }}>
                <AppInput
                  label="Бюджет (₽)"
                  placeholder="5000"
                  keyboardType="numeric"
                  value={form.price}
                  onChangeText={(t) => setForm({ ...form, price: t })}
                  error={errors.price}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Дата</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.dateText}>{formatDate(form.date)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <AppInput
              label="Подробное описание"
              placeholder="Укажите высоту потолков, тип профиля, количество углов и т.д."
              multiline
              numberOfLines={4}
              value={form.details}
              onChangeText={(t) => setForm({ ...form, details: t })}
              error={errors.details}
              style={{ height: 120, textAlignVertical: 'top' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.publishButton, loading && { opacity: 0.7 }]}
            onPress={handlePublish}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.publishText}>Опубликовать заказ</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>

        {showDatePicker && (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setForm({ ...form, date: selectedDate });
                setTempDate(selectedDate);
              }
            }}
          />
        )}

        <Modal
            visible={isImportModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setIsImportModalVisible(false)}
        >
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill}>
                <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={1}
                    onPress={() => setIsImportModalVisible(false)}
                />
                <KeyboardAvoidingView behavior="padding">
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalIconContainer}>
                                <Ionicons name="sparkles" size={24} color={COLORS.primary} />
                            </View>
                            <Text style={styles.modalTitle}>Магический импорт</Text>
                            <TouchableOpacity onPress={() => setIsImportModalVisible(false)}>
                                <Ionicons name="close" size={28} color={COLORS.gray} />
                            </TouchableOpacity>
                        </View>

                        {!parsedData ? (
                            <>
                                <Text style={styles.modalSubtitle}>
                                    Вставьте текст из чата или другого приложения. Я сам определю адрес, цену и детали.
                                </Text>
                                <TextInput
                                    style={styles.importInput}
                                    placeholder="Напр: Завтра монтаж в Химках, ул. Мира 5. ЗП 15000р. 20м2 сатин..."
                                    multiline
                                    value={importText}
                                    onChangeText={setImportText}
                                    autoFocus
                                />
                                <TouchableOpacity
                                    style={styles.importSubmitBtn}
                                    onPress={handleImport}
                                    disabled={isParsing}
                                >
                                    {isParsing ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="flash" size={20} color="#fff" />
                                            <Text style={styles.importSubmitText}>Распознать текст</Text>
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
    marginBottom: 20 },
  workTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent' },
  workTypeBtnActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary },
  workTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray },
  workTypeBtnTextActive: {
    color: COLORS.primary },
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
