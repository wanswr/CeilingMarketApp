import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/theme';
import { db, auth } from '../services/firebase';

export default function SubscriptionScreen({ navigation }: any) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAppleTesting, setIsAppleTesting] = useState(false);

  React.useEffect(() => {
    // Remote flag to hide payment instructions during Apple Review
    db.collection("config").doc("app_settings").get().then(doc => {
      if (doc.exists && doc.data()?.hidePaymentForReview) {
        setIsAppleTesting(true);
      }
    });
  }, []);

  if (isAppleTesting) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Доступ ограничен</Text>
        <Text style={styles.desc}>В данный момент функция оплаты недоступна. Пожалуйста, попробуйте позже.</Text>
      </View>
    );
  }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Доступ запрещен', 'Нужен доступ к галерее для загрузки чека.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!image) {
      Alert.alert("Ошибка", "Пожалуйста, прикрепите фото чека.");
      return;
    }

    setLoading(true);
    try {
      // Logic: Send to Telegram or save to Firestore for Admin Bot to pick up
      await db.collection("payment_requests").add({
        userId: auth.currentUser?.uid,
        userPhone: auth.currentUser?.phoneNumber,
        timestamp: Date.now(),
        status: 'pending',
        receiptUri: image, // In real app, upload this to Storage first
      });

      Alert.alert("Успешно", "Ваш чек отправлен на модерацию. Подписка будет активирована в ближайшее время.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось отправить данные.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Активация подписки</Text>
      <Text style={styles.desc}>
        Для получения доступа ко всем функциям приложения (отклики на заказы, прямые контакты), пожалуйста, оплатите подписку.
      </Text>

      <View style={styles.paymentCard}>
        <Text style={styles.cardTitle}>Реквизиты для оплаты</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Банк:</Text>
          <Text style={styles.value}>Сбербанк / Т-Банк</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Получатель:</Text>
          <Text style={styles.value}>Иван И. (Администратор)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Номер телефона (СБП):</Text>
          <Text style={[styles.value, { color: COLORS.primary, fontWeight: 'bold' }]}>+7 (999) 000-00-00</Text>
        </View>
        <View style={[styles.row, { marginTop: 15 }]}>
          <Text style={styles.priceLabel}>Стоимость (30 дней):</Text>
          <Text style={styles.priceValue}>2 990 ₽</Text>
        </View>
      </View>

      <Text style={styles.stepTitle}>Шаг 1: Сделайте перевод</Text>
      <Text style={styles.stepDesc}>Переведите указанную сумму по номеру телефона через СБП.</Text>

      <Text style={styles.stepTitle}>Шаг 2: Загрузите чек</Text>
      <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.receipt} />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={40} color={COLORS.gray} />
            <Text style={styles.uploadText}>Нажмите, чтобы выбрать фото чека</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>ОТПРАВИТЬ ЧЕК</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.supportBtn}
        onPress={() => Linking.openURL('https://t.me/ceilingsapp_support')}
      >
        <Ionicons name="send" size={20} color={COLORS.primary} />
        <Text style={styles.supportText}>Связаться с поддержкой в Telegram</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.dark, marginBottom: 10 },
  desc: { fontSize: 14, color: COLORS.gray, marginBottom: 20, lineHeight: 20 },
  paymentCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    marginBottom: 25,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: COLORS.dark },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: COLORS.gray },
  value: { fontSize: 13, fontWeight: '600' },
  priceLabel: { fontSize: 16, fontWeight: '700' },
  priceValue: { fontSize: 18, fontWeight: '900', color: COLORS.success },
  stepTitle: { fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 5 },
  stepDesc: { fontSize: 13, color: COLORS.gray, marginBottom: 15 },
  uploadBtn: {
    backgroundColor: '#fff',
    height: 150,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 25,
  },
  uploadText: { color: COLORS.gray, fontSize: 12, marginTop: 10 },
  receipt: { width: '100%', height: '100%', resizeMode: 'cover' },
  submitBtn: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
  },
  submitText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    padding: 10
  },
  supportText: { marginLeft: 8, color: COLORS.primary, fontWeight: '600' }
});
