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
import { z } from 'zod';
import { COLORS } from '../constants/theme';
import { apiService } from '../services/ApiService';

const profileSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  experience: z.number().min(0).max(50).optional(),
  instagram: z.string().optional(),
  telegram: z.string().optional(),
});

export default function EditProfileScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>({});
  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await apiService.getProfile();
      setProfile(response.data);
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось загрузить данные профиля");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const validation = profileSchema.safeParse(profile);
    if (!validation.success) {
      const fieldErrors: any = {};
      validation.error.errors.forEach(err => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await apiService.updateProfile(profile);
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
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Имя / Название</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={profile.name}
            onChangeText={(t) => setProfile({ ...profile, name: t })}
            placeholder="Введите ваше имя"
          />
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
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.dark, marginBottom: 8 },
  input: { backgroundColor: COLORS.bgLight, padding: 15, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  inputError: { borderColor: COLORS.danger },
  saveBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '800' }
});
