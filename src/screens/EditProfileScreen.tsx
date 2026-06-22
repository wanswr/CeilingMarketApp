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
import { z } from 'zod';
import { COLORS, SHADOWS } from '../constants/theme';
import { mapEngine } from '../services/MapEngine';
import { apiService } from '../services/ApiService';
import { resolveImageUrl } from '../utils/image';

const profileSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  experience: z.preprocess((v) => Number(v), z.number().min(0).max(50)).optional(),
  instagram: z.string().optional(),
  telegram: z.string().optional(),
  portfolio: z.array(z.string()).optional(),
});

export default function EditProfileScreen({ navigation }: any) {
  const [loading, setLoading] = useState(!mapEngine.getCurrentUser());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(mapEngine.getCurrentUser() || { portfolio: [] });
  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    mapEngine.syncUser().then(data => {
      setProfile(data);
      setLoading(false);
    }).catch(() => {
       if (!profile.name) {
          Alert.alert("Ошибка", "Не удалось загрузить данные профиля");
       }
    });
  }, []);

  const pickImage = async () => {
    if (profile.portfolio?.length >= 10) {
      Alert.alert('Лимит превышен', 'Максимальное количество фото в портфолио — 10 штук.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужен доступ к галерее');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10 - (profile.portfolio?.length || 0),
      quality: 0.7,
    });

    if (!result.canceled) {
      setUploading(true);
      try {
        const formData = new FormData();
        result.assets.forEach((asset, index) => {
          const filename = asset.uri.split('/').pop() || `p_${index}.jpg`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : `image`;
          // @ts-ignore
          formData.append('files', { uri: asset.uri, name: filename, type });
        });

        const uploadRes = await apiService.uploadOrderImages(formData);
        const newUrls = uploadRes.data;
        setProfile({
          ...profile,
          portfolio: [...(profile.portfolio || []), ...newUrls]
        });
      } catch (e) {
        Alert.alert('Ошибка', 'Не удалось загрузить изображения');
      } finally {
        setUploading(false);
      }
    }
  };

  const removePortfolioImage = (index: number) => {
      const updated = [...(profile.portfolio || [])];
      updated.splice(index, 1);
      setProfile({ ...profile, portfolio: updated });
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
      await mapEngine.updateProfile(profile);
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
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={styles.card}>
            <Text style={styles.sectionTitle}>Основная информация</Text>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Имя / Название компании</Text>
                <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    value={profile.name}
                    onChangeText={(t) => setProfile({ ...profile, name: t })}
                    placeholder="Иван Иванов"
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Опыт работы (лет)</Text>
                <TextInput
                    style={[styles.input, errors.experience && styles.inputError]}
                    value={profile.experience?.toString()}
                    onChangeText={(t) => setProfile({ ...profile, experience: t })}
                    placeholder="Например: 5"
                    keyboardType="numeric"
                />
            </View>
        </View>

        <View style={styles.card}>
            <Text style={styles.sectionTitle}>Социальные сети</Text>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Никнейм в Telegram (без @)</Text>
                <TextInput
                    style={styles.input}
                    value={profile.telegram}
                    onChangeText={(t) => setProfile({ ...profile, telegram: t })}
                    placeholder="ivan_ceiling"
                    autoCapitalize="none"
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Никнейм в Instagram</Text>
                <TextInput
                    style={styles.input}
                    value={profile.instagram}
                    onChangeText={(t) => setProfile({ ...profile, instagram: t })}
                    placeholder="ivan_master"
                    autoCapitalize="none"
                />
            </View>
        </View>

        <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <Text style={styles.sectionTitle}>Портфолио ({profile.portfolio?.length || 0}/10)</Text>
                <TouchableOpacity onPress={pickImage} disabled={uploading}>
                    {uploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="add-circle" size={28} color={COLORS.primary} />}
                </TouchableOpacity>
            </View>

            <View style={styles.portfolioGrid}>
                {profile.portfolio?.map((img: string, idx: number) => (
                    <View key={idx} style={styles.portfolioItem}>
                        <Image source={{ uri: resolveImageUrl(img) }} style={styles.portfolioThumb} />
                        <TouchableOpacity style={styles.removeBtn} onPress={() => removePortfolioImage(idx)}>
                            <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (saving || uploading) && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving || uploading}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>СОХРАНИТЬ ИЗМЕНЕНИЯ</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 24, marginBottom: 20, ...SHADOWS.soft },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 15 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.gray, marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, fontSize: 16, color: COLORS.dark },
  inputError: { borderWidth: 1, borderColor: COLORS.danger },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4, marginLeft: 4 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 20, borderRadius: 18, alignItems: 'center', marginTop: 10, ...SHADOWS.medium },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portfolioItem: { position: 'relative' },
  portfolioThumb: { width: (Dimensions.get('window').width - 100) / 3, height: 100, borderRadius: 12 },
  removeBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 10 }
});
