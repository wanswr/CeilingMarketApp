import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView, Platform, Linking, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { mapEngine } from '../services/MapEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SHADOWS } from '../constants/theme';
import { resolveImageUrl } from '../utils/image';

const ProfileScreen = ({ route, navigation }: any) => {
  const userId = route.params?.userId;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const responseData = userId
        ? await mapEngine.getExternalUser(userId)
        : await mapEngine.syncUser();
      setUser(responseData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.replace('Auth');
  };

  const toggleRole = async () => {
      const newRole = user?.role === 'WORKER' ? 'EMPLOYER' : 'WORKER';
      try {
          await mapEngine.updateProfile({ role: newRole });
          setUser({ ...user, role: newRole });
          Alert.alert('Роль изменена', `Вы переключились в режим ${newRole === 'WORKER' ? 'Исполнителя' : 'Заказчика'}`);
      } catch (e) {
          Alert.alert('Ошибка', 'Не удалось изменить роль');
      }
  };

  const openSocial = (type: 'tg' | 'inst') => {
      const url = type === 'tg' ? `https://t.me/${user?.telegram}` : `https://instagram.com/${user?.instagram}`;
      Linking.openURL(url).catch(() => Alert.alert('Ошибка', 'Не удалось открыть ссылку'));
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={COLORS.primary} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {userId && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <BlurView intensity={80} tint="light" style={styles.backBtnBlur}>
            <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
          </BlurView>
        </TouchableOpacity>
      )}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
             <View style={styles.avatarWrapper}>
                <Text style={styles.avatarText}>{user?.name ? user.name[0] : 'U'}</Text>
             </View>
             {user?.isVerified && (
               <View style={styles.verifiedBadge}>
                 <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
               </View>
             )}
          </View>

          <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
          <View style={styles.roleContainer}>
              <View style={[styles.roleBadge, { backgroundColor: user?.role === 'WORKER' ? COLORS.primary + '20' : COLORS.secondary + '20' }]}>
                  <Text style={[styles.roleText, { color: user?.role === 'WORKER' ? COLORS.primary : COLORS.secondary }]}>
                      {user?.role === 'WORKER' ? 'Исполнитель' : 'Заказчик'}
                  </Text>
              </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
              <Text style={styles.statLabel}>Рейтинг</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.completedOrders || 0}</Text>
              <Text style={styles.statLabel}>Выполнено</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.ordersCount || 0}</Text>
              <Text style={styles.statLabel}>Размещено</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {!userId && (
              <View style={styles.roleToggleCard}>
                  <View>
                      <Text style={styles.roleToggleTitle}>Сменить роль</Text>
                      <Text style={styles.roleToggleSubtitle}>Сейчас вы {user?.role === 'WORKER' ? 'мастер' : 'заказчик'}</Text>
                  </View>
                  <TouchableOpacity style={styles.toggleBtn} onPress={toggleRole}>
                      <View style={[styles.toggleTrack, { backgroundColor: user?.role === 'WORKER' ? COLORS.primary : COLORS.secondary }]}>
                          <View style={[styles.toggleThumb, user?.role === 'EMPLOYER' && { transform: [{ translateX: 26 }] }]} />
                      </View>
                  </TouchableOpacity>
              </View>
          )}

          {user?.role === 'WORKER' && user?.portfolio?.length > 0 && (
              <View style={styles.portfolioSection}>
                  <Text style={styles.sectionTitle}>Портфолио</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.portfolioScroll}>
                      {user.portfolio.map((img: string, idx: number) => (
                          <Image key={idx} source={{ uri: resolveImageUrl(img) }} style={styles.portfolioImg} />
                      ))}
                  </ScrollView>
              </View>
          )}

          {(user?.telegram || user?.instagram) && (
              <View style={styles.socialSection}>
                  <Text style={styles.sectionTitle}>Социальные сети</Text>
                  <View style={styles.socialGrid}>
                      {user.telegram && (
                          <TouchableOpacity style={styles.socialBtn} onPress={() => openSocial('tg')}>
                              <Ionicons name="paper-plane" size={24} color="#0088cc" />
                              <Text style={styles.socialBtnText}>Telegram</Text>
                          </TouchableOpacity>
                      )}
                      {user.instagram && (
                          <TouchableOpacity style={[styles.socialBtn, { marginLeft: 12 }]} onPress={() => openSocial('inst')}>
                              <Ionicons name="logo-instagram" size={24} color="#E1306C" />
                              <Text style={styles.socialBtnText}>Instagram</Text>
                          </TouchableOpacity>
                      )}
                  </View>
              </View>
          )}

          <Text style={styles.sectionTitle}>Управление</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('EditProfile')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(45, 91, 255, 0.1)' }]}>
                <Ionicons name="person" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.menuText}>Личные данные</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Subscription')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(130, 87, 229, 0.1)' }]}>
                <Ionicons name="card" size={20} color={COLORS.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>Подписка</Text>
                <Text style={[styles.menuSubtext, { color: user?.subscription?.isActive ? COLORS.success : COLORS.danger }]}>
                  {user?.subscription?.isActive ? 'Активна' : 'Не активна'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('В разработке')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 200, 151, 0.1)' }]}>
                <Ionicons name="list" size={20} color={COLORS.success} />
              </View>
              <Text style={styles.menuText}>История заказов</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
             <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
             <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>

          <Text style={styles.version}>Версия 2.4.0 (2026.1)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 20,
    zIndex: 100
  },
  backBtnBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  profileHeader: { alignItems: 'center', paddingTop: 40, paddingBottom: 30, backgroundColor: COLORS.white, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, ...SHADOWS.soft },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: '900' },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.white, borderRadius: 12, padding: 2, ...SHADOWS.soft },
  name: { fontSize: 24, fontWeight: '900', color: COLORS.dark, letterSpacing: -0.5 },
  roleContainer: { marginTop: 8 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  roleText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  phone: { fontSize: 15, color: COLORS.gray, marginTop: 4, fontWeight: '500' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingHorizontal: 30 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  statDivider: { width: 1, height: 24, backgroundColor: COLORS.border, marginHorizontal: 10 },
  content: { padding: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 16, letterSpacing: -0.5 },
  menuCard: { backgroundColor: COLORS.white, borderRadius: 28, padding: 10, ...SHADOWS.soft },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuText: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.dark },
  menuSubtext: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, padding: 20, borderRadius: 20, backgroundColor: 'rgba(255, 71, 87, 0.05)' },
  logoutText: { marginLeft: 10, fontSize: 16, fontWeight: '700', color: COLORS.danger },
  version: { textAlign: 'center', marginTop: 30, color: COLORS.placeholder, fontSize: 12, fontWeight: '500' },
  roleToggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.white,
      padding: 20,
      borderRadius: 24,
      marginBottom: 24,
      ...SHADOWS.soft
  },
  roleToggleTitle: { fontSize: 16, fontWeight: '800', color: COLORS.dark },
  roleToggleSubtitle: { fontSize: 13, color: COLORS.gray, marginTop: 2, fontWeight: '500' },
  toggleBtn: { padding: 4 },
  toggleTrack: { width: 56, height: 30, borderRadius: 15, padding: 4, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', ...SHADOWS.small },
  portfolioSection: { marginBottom: 24 },
  portfolioScroll: { gap: 12 },
  portfolioImg: { width: 140, height: 140, borderRadius: 20, backgroundColor: '#f0f0f0' },
  socialSection: { marginBottom: 24 },
  socialGrid: { flexDirection: 'row' },
  socialBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.white,
      padding: 14,
      borderRadius: 18,
      ...SHADOWS.soft,
      gap: 8
  },
  socialBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.dark }
});

export default ProfileScreen;
