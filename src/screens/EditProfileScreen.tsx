import React, { useState, useEffect } from 'react';

import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
 } from 'react-native'
import { z } from 'zod'
import { COLORS } from '../constants/theme'
import { mapEngine } from '../services/MapEngine'
import { apiService } from '../services/ApiService'
import { Ionicons } from '@expo/vector-icons'
import { storageService } from '../services/StorageService'
import { useAuth } from '../context/AuthContext'

const profileSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  experience: z.number().min(0).max(50).optional(),
  instagram: z.string().optional(),
  telegram: z.string().optional(),
  avatar: z.string().optional(),
  description: z.string().optional()
});

export default function EditProfileScreen({ navigation }: any) {
  const [loading, setLoading] = useState(!mapEngine.getCurrentUser());
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(mapEngine.getCurrentUser() || {});
  const [errors, setErrors] = useState<any>({});
  const { logout } = useAuth();

  // Portfolio states
  const [portfolioItems, setPortfolioItems] = useState<any[]>([]);
  const [newPortUrl, setNewPortfolioUrl] = useState('');
  const [newPortDesc, setNewPortfolioDesc] = useState('');
  const [addingPort, setAddingPort] = useState(false);

  useEffect(() => {
    mapEngine.syncUser().then(data => {
      setProfile(data);
      setLoading(false);
      fetchPortfolio(data.id);
    }).catch(() => {
       if (!profile.name) {
          Alert.alert("Ошибка", "Не удалось загрузить данные профиля");
       }
    });
  }, []);

  const fetchPortfolio = async (userId: string) => {
    try {
      const res = await apiService.api.get(`users/${userId}/portfolio`);
      setPortfolioItems(res.data);
    } catch (e) {}
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
      Alert.alert("Успех", "Профиль успешно обновлен");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPortfolio = async () => {
    if (!newPortUrl.trim()) {
        Alert.alert("Ошибка", "Пожалуйста, введите URL-ссылку на изображение");
        return;
    }

    setAddingPort(true);
    try {
        await apiService.api.post('users/profile/portfolio', {
            imageUrl: newPortUrl.trim(),
            description: newPortDesc.trim() || undefined,
            workType: 'INSTALLATION'
        });
        setNewPortfolioUrl('');
        setNewPortfolioDesc('');
        Alert.alert("Успех", "Фото успешно добавлено в портфолио");
        fetchPortfolio(profile.id);
    } catch (e) {
        Alert.alert("Ошибка", "Не удалось добавить элемент в портфолио");
    } finally {
        setAddingPort(false);
    }
  };

  const handleDeletePortfolioItem = async (itemId: string) => {
    Alert.alert(
      "Удалить фото",
      "Вы уверены, что хотите удалить это изображение из своего портфолио?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            try {
              await apiService.api.delete(`users/profile/portfolio/${itemId}`);
              Alert.alert("Успех", "Изображение удалено");
              fetchPortfolio(profile.id);
            } catch (e) {
              Alert.alert("Ошибка", "Не удалось удалить изображение");
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Удалить аккаунт",
      "Вы уверены, что хотите безвозвратно удалить свой аккаунт? Все ваши данные будут стерты.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await apiService.api.delete('users/profile');
              storageService.clearAll();
              await logout();
            } catch (error: any) {
              Alert.alert("Ошибка", "Не удалось удалить аккаунт");
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.sectionHeader}>Личные данные</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Имя / Название</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={profile.name}
            onChangeText={(t) => setProfile({ ...profile, name: t })}
            placeholder="Введите ваше имя"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ссылка на аватар / фото (URL)</Text>
          <TextInput
            style={[styles.input, errors.avatar && styles.inputError]}
            value={profile.avatar || ''}
            onChangeText={(t) => setProfile({ ...profile, avatar: t })}
            placeholder="https://example.com/avatar.jpg"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>О себе / Описание профиля</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }, errors.description && styles.inputError]}
            value={profile.description || ''}
            onChangeText={(t) => setProfile({ ...profile, description: t })}
            placeholder="Расскажите о себе, ваших услугах или компании..."
            multiline
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Опыт работы (лет)</Text>
          <TextInput
            style={[styles.input, errors.experience && styles.inputError]}
            value={profile.experience !== undefined && profile.experience !== null ? String(profile.experience) : ''}
            onChangeText={(t) => setProfile({ ...profile, experience: t ? parseInt(t, 10) || 0 : undefined })}
            placeholder="Например: 5"
            keyboardType="number-pad"
          />
        </View>

        <Text style={styles.sectionHeader}>Социальные сети</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Никнейм в Telegram (без @)</Text>
          <TextInput
            style={[styles.input, errors.telegram && styles.inputError]}
            value={profile.telegram || ''}
            onChangeText={(t) => setProfile({ ...profile, telegram: t.replace('@', '') })}
            placeholder="username"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ссылка на Instagram</Text>
          <TextInput
            style={[styles.input, errors.instagram && styles.inputError]}
            value={profile.instagram || ''}
            onChangeText={(t) => setProfile({ ...profile, instagram: t })}
            placeholder="https://instagram.com/username"
            autoCapitalize="none"
          />
        </View>

        {/* Master Portfolio Manager */}
        {profile.role === 'WORKER' && (
            <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionHeader}>Управление портфолио</Text>

                {/* List existing items */}
                {portfolioItems.length > 0 && (
                    <View style={styles.portfolioList}>
                        {portfolioItems.map(item => (
                            <View key={item.id} style={styles.portfolioItemRow}>
                                <Image source={{ uri: item.imageUrl }} style={styles.portfolioThumb} />
                                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                                    <Text style={styles.portfolioItemDesc} numberOfLines={1}>
                                        {item.description || 'Без описания'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => handleDeletePortfolioItem(item.id)} style={styles.deletePortBtn}>
                                    <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Add new item form */}
                <View style={styles.addPortfolioBox}>
                    <Text style={styles.addPortfolioTitle}>Добавить работу в портфолио</Text>

                    <TextInput
                        style={styles.smallInput}
                        value={newPortUrl}
                        onChangeText={setNewPortfolioUrl}
                        placeholder="Ссылка на изображение (URL)"
                        autoCapitalize="none"
                    />

                    <TextInput
                        style={styles.smallInput}
                        value={newPortDesc}
                        onChangeText={setNewPortfolioDesc}
                        placeholder="Краткое описание работы"
                    />

                    <TouchableOpacity
                        style={styles.addPortSubmitBtn}
                        onPress={handleAddPortfolio}
                        disabled={addingPort}
                    >
                        {addingPort ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.addPortSubmitBtnText}>Добавить фото</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>СОХРАНИТЬ ИЗМЕНЕНИЯ</Text>}
        </TouchableOpacity>

        {/* Danger Account Delete Option */}
        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountBtnText}>УДАЛИТЬ АККАУНТ</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginTop: 25, marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingBottom: 8 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.dark, marginBottom: 8 },
  input: { backgroundColor: COLORS.bgLight, padding: 15, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, color: COLORS.dark },
  smallInput: { backgroundColor: COLORS.bgLight, padding: 12, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, color: COLORS.dark },
  inputError: { borderColor: COLORS.danger },
  saveBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 35 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  deleteAccountBtn: { padding: 15, alignItems: 'center', marginTop: 25, borderRadius: 15, borderWidth: 1, borderColor: COLORS.danger },
  deleteAccountBtnText: { color: COLORS.danger, fontWeight: '800', fontSize: 15 },
  portfolioList: { marginVertical: 10 },
  portfolioItemRow: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#f9f9f9', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  portfolioThumb: { width: 50, height: 50, borderRadius: 8, resizeMode: 'cover' },
  portfolioItemDesc: { fontSize: 13, fontWeight: '600', color: COLORS.dark },
  deletePortBtn: { padding: 8 },
  addPortfolioBox: { backgroundColor: '#f9f9f9', padding: 16, borderRadius: 15, borderWidth: 1, borderColor: '#eee', marginTop: 15 },
  addPortfolioTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 12 },
  addPortSubmitBtn: { backgroundColor: COLORS.dark, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  addPortSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 }
});