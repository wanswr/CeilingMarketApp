import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc } from '@firebase/firestore';
import { COLORS } from '../constants/theme';
import { db, auth } from '../services/firebase';

export default function VerificationScreen({ navigation }: any) {
  const [selfie, setSelfie] = useState<string | null>(null);
  const [passport, setPassport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async (type: 'selfie' | 'passport') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled) {
      if (type === 'selfie') setSelfie(result.assets[0].uri);
      else setPassport(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!selfie || !passport) {
      Alert.alert("Ошибка", "Пожалуйста, загрузите обе фотографии.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "verification_requests"), {
        userId: auth.currentUser?.uid,
        timestamp: Date.now(),
        status: 'pending',
        selfieUri: selfie,
        passportUri: passport
      });

      Alert.alert("Отправлено", "Ваши данные отправлены на проверку. После верификации у вас появится значок проверенного мастера.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось отправить запрос.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Верификация мастера</Text>
      <Text style={styles.desc}>
        Статус «Проверенный мастер» повышает доверие заказчиков в 3 раза. Для получения статуса загрузите фото.
      </Text>

      <Text style={styles.label}>1. Селфи с паспортом в руках</Text>
      <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage('selfie')}>
        {selfie ? <Image source={{ uri: selfie }} style={styles.preview} /> : (
          <Ionicons name="camera-outline" size={32} color={COLORS.gray} />
        )}
      </TouchableOpacity>

      <Text style={styles.label}>2. Фото паспорта (основной разворот)</Text>
      <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage('passport')}>
        {passport ? <Image source={{ uri: passport }} style={styles.preview} /> : (
          <Ionicons name="document-text-outline" size={32} color={COLORS.gray} />
        )}
      </TouchableOpacity>

      <View style={styles.securityNote}>
        <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.success} />
        <Text style={styles.noteText}>Ваши данные зашифрованы и используются только для внутренней проверки модератором.</Text>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>ОТПРАВИТЬ НА ПРОВЕРКУ</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
  desc: { fontSize: 13, color: COLORS.gray, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 15 },
  uploadBox: {
    height: 180,
    backgroundColor: '#fff',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  preview: { width: '100%', height: '100%', resizeMode: 'cover' },
  securityNote: { flexDirection: 'row', backgroundColor: '#EBF8FF', padding: 12, borderRadius: 10, marginVertical: 25 },
  noteText: { fontSize: 11, color: '#2B6CB0', marginLeft: 8, flex: 1 },
  submitBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold' }
});
