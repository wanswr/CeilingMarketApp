import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Dimensions,
  Linking,
  ActivityIndicator
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/theme';
import { orderService, UserProfile } from '../services/OrderService';
import { auth } from '../services/firebase';

const { width } = Dimensions.get('window');

const ProfileScreen = ({ navigation }: any) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(orderService.getCurrentRole());

  useEffect(() => {
    loadProfile();
    const syncRole = (r: any) => setRole(r);
    orderService.on('roleChanged', syncRole);
    return () => { orderService.off('roleChanged', syncRole); };
  }, []);

  const loadProfile = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const p = await orderService.getUserProfile(auth.currentUser.uid);
      setProfile(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: () => auth.signOut() }
    ]);
  };

  const toggleRole = () => {
    const nextRole = role === 'employer' ? 'worker' : 'employer';
    orderService.setRole(nextRole);
    Alert.alert("Роль изменена", `Вы вошли как ${nextRole === 'employer' ? 'Работодатель' : 'Мастер'}`);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      // Здесь в будущем будет загрузка в Firebase Storage
      Alert.alert("Успех", "Фото отправлено на верификацию!");
      if (profile) {
        const updated = { ...profile, photoUrl: result.assets[0].uri, isVerified: true };
        setProfile(updated);
        orderService.updateProfile(profile.uid, { photoUrl: result.assets[0].uri, isVerified: true });
      }
    }
  };

  const renderRating = (rating: number) => {
    return (
      <View style={styles.ratingContainer}>
        {[...Array(10)].map((_, i) => (
          <Ionicons
            key={i}
            name={i < rating ? "star" : "star-outline"}
            size={18}
            color={i < rating ? "#FFD700" : "#ccc"}
          />
        ))}
      </View>
    );
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!profile) return <View style={styles.loading}><Text>Профиль не найден</Text></View>;

  const trialDaysLeft = Math.max(0, Math.ceil((profile.trialUntil - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header / Photo */}
      <View style={styles.header}>
        <TouchableOpacity onPress={pickImage} style={styles.photoContainer}>
          {profile.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={40} color="#fff" />
              <Text style={styles.photoPlaceholderText}>Сделать селфи</Text>
            </View>
          )}
          {profile.isVerified && (
            <View style={styles.verifyBadge}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.name}>{profile.fio || 'Пользователь'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{role === 'employer' ? 'РАБОТОДАТЕЛЬ' : 'МАСТЕР'}</Text>
        </View>

        {renderRating(profile.stats.rating)}
        <Text style={styles.reviewsText}>{profile.stats.reviewsCount} отзывов</Text>
      </View>

      {/* Trial Info */}
      <View style={styles.trialCard}>
        <View>
          <Text style={styles.trialTitle}>Пробный период</Text>
          <Text style={styles.trialSub}>Осталось {trialDaysLeft} дней</Text>
        </View>
        <TouchableOpacity style={styles.trialBtn}>
          <Text style={styles.trialBtnText}>КУПИТЬ</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Статистика</Text>
        <View style={styles.statsGrid}>
          {role === 'worker' ? (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{profile.stats.completedOrders || 0}</Text>
                <Text style={styles.statLabel}>Выполнено</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>98%</Text>
                <Text style={styles.statLabel}>Успешно</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{profile.city || '—'}</Text>
                <Text style={styles.statLabel}>Город</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{profile.stats.createdOrders || 0}</Text>
                <Text style={styles.statLabel}>Создано</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>Быстро</Text>
                <Text style={styles.statLabel}>Ответ</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>10/10</Text>
                <Text style={styles.statLabel}>Оценка</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Portfolio (for worker) */}
      {role === 'worker' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Портфолио</Text>
            <TouchableOpacity><Text style={styles.addText}>Добавить</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.portfolioPlaceholder}>
                <Ionicons name="image-outline" size={30} color="#ccc" />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Social Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Контакты и соцсети</Text>
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => Linking.openURL(profile.socialLinks?.telegram ? `https://t.me/${profile.socialLinks.telegram.replace('@', '')}` : 'https://t.me/')}
          >
            <FontAwesome name="telegram" size={24} color="#0088cc" />
            <Text style={styles.socialName}>{profile.socialLinks?.telegram || 'Telegram'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => Linking.openURL(profile.socialLinks?.instagram ? `https://instagram.com/${profile.socialLinks.instagram}` : 'https://instagram.com/')}
          >
            <FontAwesome name="instagram" size={24} color="#e1306c" />
            <Text style={styles.socialName}>{profile.socialLinks?.instagram || 'Instagram'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionSection}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleRole}>
          <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} />
          <Text style={styles.actionText}>Сменить роль</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert("Поддержка", "Связь с оператором: @ceilings_support")}>
          <Ionicons name="help-circle" size={20} color={COLORS.primary} />
          <Text style={styles.actionText}>Служба поддержки</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { borderBottomWidth: 0 }]} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#FF3B30" />
          <Text style={[styles.actionText, { color: '#FF3B30' }]}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  photoContainer: { width: width * 0.8, height: width * 0.8, borderRadius: 30, overflow: 'hidden', backgroundColor: '#e1e1e1', marginBottom: 15, elevation: 5 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.gray },
  photoPlaceholderText: { color: '#fff', fontSize: 12, marginTop: 5 },
  verifyBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#fff', borderRadius: 15, padding: 2 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  roleBadge: { backgroundColor: '#F0F0FF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginVertical: 8 },
  roleText: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  ratingContainer: { flexDirection: 'row', marginTop: 5 },
  reviewsText: { color: COLORS.gray, fontSize: 13, marginTop: 4 },

  trialCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#333', margin: 20, padding: 20, borderRadius: 20 },
  trialTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  trialSub: { color: '#bbb', fontSize: 13 },
  trialBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  trialBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  section: { backgroundColor: '#fff', marginHorizontal: 20, marginBottom: 15, padding: 20, borderRadius: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  addText: { color: COLORS.primary, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  portfolioScroll: { flexDirection: 'row' },
  portfolioPlaceholder: { width: 100, height: 100, backgroundColor: '#f0f0f0', borderRadius: 12, marginRight: 10, justifyContent: 'center', alignItems: 'center' },

  socialRow: { flexDirection: 'row', justifyContent: 'space-around' },
  socialBtn: { alignItems: 'center' },
  socialName: { fontSize: 12, color: COLORS.gray, marginTop: 5 },

  actionSection: { backgroundColor: '#fff', marginHorizontal: 20, paddingVertical: 5, borderRadius: 20, marginBottom: 20 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  actionText: { fontSize: 16, marginLeft: 15, fontWeight: '500' }
});

export default ProfileScreen;
