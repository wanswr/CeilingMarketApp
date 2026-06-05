import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc } from '@firebase/firestore';
import { z } from 'zod';
import { COLORS } from '../constants/theme';
import { db, auth } from '../services/firebase';
import { UserProfile } from '../types';

const profileSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  experience: z.number().min(0).max(50).optional(),
  instagram: z.string().optional(),
  telegram: z.string().optional(),
});

export default function EditProfileScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({});
  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось загрузить данные профиля");
    } finally {
      setLoading(false);
    }
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setProfile({ ...profile, avatar: result.assets[0].uri });
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;

    // Validation
    const validation = profileSchema.safeParse({
      name: profile.name,
      experience: profile.experience,
      instagram: profile.instagram,
      telegram: profile.telegram
    });

    if (!validation.success) {
      const fieldErrors: any = {};
      validation.error.errors.forEach(err => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      Alert.alert("Ошибка валидации", "Пожалуйста, проверьте правильность заполнения полей");
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, {
        name: profile.name,
        experience: profile.experience || 0,
        instagram: profile.instagram || "",
        telegram: profile.telegram || "",
        avatar: profile.avatar || "",
        updatedAt: Date.now()
      });
      Alert.alert("Успех", "Профиль обновлен");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarContainer}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={50} color="#ccc" />
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Нажмите, чтобы изменить фото</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Имя / Название</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={profile.name}
            onChangeText={(t) => setProfile({ ...profile, name: t })}
            placeholder="Введите ваше имя"
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Опыт работы (лет)</Text>
          <TextInput
            style={[styles.input, errors.experience && styles.inputError]}
            value={profile.experience?.toString()}
            onChangeText={(t) => setProfile({ ...profile, experience: parseInt(t) || 0 })}
            keyboardType="numeric"
            placeholder="Напр: 5"
          />
          {errors.experience && <Text style={styles.errorText}>{errors.experience}</Text>}
        </View>

        <View style={styles.socialGroup}>
          <Text style={styles.label}>Социальные сети</Text>
          <View style={styles.socialRow}>
            <Ionicons name="logo-instagram" size={24} color="#E1306C" />
            <TextInput
              style={[styles.input, { flex: 1, marginLeft: 10 }]}
              value={profile.instagram}
              onChangeText={(t) => setProfile({ ...profile, instagram: t })}
              placeholder="@username"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.socialRow}>
            <Ionicons name="send" size={24} color="#0088cc" />
            <TextInput
              style={[styles.input, { flex: 1, marginLeft: 10 }]}
              value={profile.telegram}
              onChangeText={(t) => setProfile({ ...profile, telegram: t })}
              placeholder="@username"
              autoCapitalize="none"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>СОХРАНИТЬ ИЗМЕНЕНИЯ</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: COLORS.bgLight },
  avatarPlaceholder: { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff'
  },
  avatarHint: { fontSize: 12, color: COLORS.gray, marginTop: 10 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.dark, marginBottom: 8, marginLeft: 4 },
  input: {
    backgroundColor: COLORS.bgLight,
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  socialGroup: { marginBottom: 30 },
  socialRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 50 },
  saveText: { color: '#fff', fontWeight: '800', letterSpacing: 1 }
});
