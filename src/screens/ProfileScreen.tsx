import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Linking,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { mapEngine } from '../services/MapEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SHADOWS } from '../constants/theme';
import { resolveImageUrl } from '../utils/image';

const ProfileScreen = ({ route, navigation }: any) => {
  const { width } = useWindowDimensions();
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
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const toggleRole = async () => {
      const newRole = user?.role === 'WORKER' ? 'EMPLOYER' : 'WORKER';
      try {
          await mapEngine.updateProfile({ role: newRole });
          setUser({ ...user, role: newRole });
          // Force layout refresh if needed
          Alert.alert('Роль изменена', `Вы переключились в режим ${newRole === 'WORKER' ? 'Исполнителя' : 'Заказчика'}`);
      } catch (e) {
          Alert.alert('Ошибка', 'Не удалось изменить роль');
      }
  };

  const openSocial = (type: 'tg' | 'inst') => {
      const handle = type === 'tg' ? user?.telegram : user?.instagram;
      if (!handle) {
          Alert.alert('Не указано', 'Пользователь не указал ссылку на соцсеть');
          return;
      }
      const url = type === 'tg' ? `https://t.me/${handle}` : `https://instagram.com/${handle}`;
      Linking.openURL(url).catch(() => Alert.alert('Ошибка', 'Не удалось открыть ссылку'));
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={COLORS.primary} />;
  }

  const isMe = !userId || userId === mapEngine.getCurrentUser()?.id;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Modern Header Background */}
        <View style={styles.headerBackground}>
             <View style={[styles.circle, { top: -50, right: -50, width: 200, height: 200, opacity: 0.1 }]} />
             <View style={[styles.circle, { bottom: -20, left: -30, width: 120, height: 120, opacity: 0.05 }]} />
        </View>

        <View style={styles.profileInfo}>
            <View style={styles.avatarContainer}>
                <View style={styles.avatarWrapper}>
                    <Text style={styles.avatarText}>{user?.name ? user.name[0] : 'U'}</Text>
                </View>
                {user?.isVerified && (
                    <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                    </View>
                )}
            </View>

            <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>

            {user?.experience > 0 && (
                <View style={styles.expBadge}>
                    <Ionicons name="medal-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.expText}>{user.experience} лет опыта</Text>
                </View>
            )}

            <View style={styles.socialRow}>
                <TouchableOpacity
                    style={[styles.socialIconBtn, { backgroundColor: '#0088cc15' }]}
                    onPress={() => openSocial('tg')}
                    disabled={!user?.telegram}
                >
                    <Ionicons name="paper-plane" size={20} color={user?.telegram ? "#0088cc" : COLORS.placeholder} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.socialIconBtn, { backgroundColor: '#E1306C15' }]}
                    onPress={() => openSocial('inst')}
                    disabled={!user?.instagram}
                >
                    <Ionicons name="logo-instagram" size={20} color={user?.instagram ? "#E1306C" : COLORS.placeholder} />
                </TouchableOpacity>
            </View>
        </View>

        <View style={styles.content}>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <Text style={styles.statVal}>{user?.rating?.toFixed(1) || '5.0'}</Text>
                    <Text style={styles.statLab}>Рейтинг</Text>
                    <View style={styles.statIcon}><Ionicons name="star" size={12} color={COLORS.warning} /></View>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statVal}>{user?.completedOrders || 0}</Text>
                    <Text style={styles.statLab}>Выполнено</Text>
                    <View style={[styles.statIcon, { backgroundColor: COLORS.success + '20' }]}><Ionicons name="checkmark-done" size={12} color={COLORS.success} /></View>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statVal}>{user?.ordersCount || 0}</Text>
                    <Text style={styles.statLab}>Размещено</Text>
                    <View style={[styles.statIcon, { backgroundColor: COLORS.secondary + '20' }]}><Ionicons name="list" size={12} color={COLORS.secondary} /></View>
                </View>
            </View>

            {/* Role Switcher - Me Only */}
            {isMe && (
                <View style={styles.roleToggleContainer}>
                    <Text style={styles.sectionTitle}>Режим работы</Text>
                    <TouchableOpacity style={styles.roleToggleBase} activeOpacity={0.9} onPress={toggleRole}>
                        <View style={[styles.rolePart, user?.role === 'WORKER' && styles.rolePartActive]}>
                            <Ionicons name="construct" size={18} color={user?.role === 'WORKER' ? '#fff' : COLORS.gray} />
                            <Text style={[styles.rolePartText, user?.role === 'WORKER' && styles.rolePartTextActive]}>Мастер</Text>
                        </View>
                        <View style={[styles.rolePart, user?.role === 'EMPLOYER' && styles.rolePartActive]}>
                            <Ionicons name="briefcase" size={18} color={user?.role === 'EMPLOYER' ? '#fff' : COLORS.gray} />
                            <Text style={[styles.rolePartText, user?.role === 'EMPLOYER' && styles.rolePartTextActive]}>Заказчик</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            )}

            {/* Portfolio Section */}
            {user?.role === 'WORKER' && (
                <View style={styles.portfolioSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Портфолио</Text>
                        <Text style={styles.sectionSubtitle}>{user?.portfolio?.length || 0}/10 фото</Text>
                    </View>
                    {user?.portfolio?.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.portfolioScroll}>
                            {user.portfolio.map((img: string, idx: number) => (
                                <TouchableOpacity key={idx} activeOpacity={0.9}>
                                    <Image source={{ uri: resolveImageUrl(img) }} style={styles.portfolioImg} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    ) : (
                        <View style={styles.emptyPortfolio}>
                            <Ionicons name="images-outline" size={40} color={COLORS.border} />
                            <Text style={styles.emptyPortfolioText}>Работы пока не добавлены</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Management Menu - Me Only */}
            {isMe && (
                <>
                    <Text style={styles.sectionTitle}>Настройки</Text>
                    <View style={styles.menuCard}>
                        <MenuButton
                            icon="person-outline"
                            label="Редактировать профиль"
                            onPress={() => navigation.navigate('EditProfile')}
                        />
                        <MenuButton
                            icon="card-outline"
                            label="Подписка и тарифы"
                            color={COLORS.secondary}
                            sublabel={user?.subscription?.isActive ? 'Активна' : 'Не активна'}
                            onPress={() => navigation.navigate('Subscription')}
                        />
                        <MenuButton
                            icon="shield-checkmark-outline"
                            label="Верификация аккаунта"
                            color={COLORS.success}
                            onPress={() => navigation.navigate('Verification')}
                        />
                        <MenuButton
                            icon="share-social-outline"
                            label="Пригласить друзей"
                            onPress={() => navigation.navigate('InviteFriends')}
                        />
                        <MenuButton
                            icon="log-out-outline"
                            label="Выйти"
                            color={COLORS.danger}
                            hideChevron
                            onPress={handleLogout}
                        />
                    </View>
                </>
            )}

            <Text style={styles.version}>Ceiling Market v2.5.0 • Product of 2026</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const MenuButton = ({ icon, label, onPress, color = COLORS.primary, sublabel, hideChevron }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
        <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={styles.menuText}>{label}</Text>
            {sublabel && <Text style={[styles.menuSubtext, { color: sublabel === 'Активна' ? COLORS.success : COLORS.gray }]}>{sublabel}</Text>}
        </View>
        {!hideChevron && <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />}
    </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 300,
      backgroundColor: COLORS.white,
      borderBottomLeftRadius: 60,
      borderBottomRightRadius: 60,
      overflow: 'hidden'
  },
  circle: { position: 'absolute', borderRadius: 100, backgroundColor: COLORS.primary },
  backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 20 : 20, left: 20, zIndex: 100 },
  backBtnBlur: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  profileInfo: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  avatarContainer: { position: 'relative', marginBottom: 15 },
  avatarWrapper: { width: 110, height: 110, borderRadius: 55, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium, borderWidth: 4, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 44, fontWeight: '900' },
  verifiedBadge: { position: 'absolute', bottom: 5, right: 0, backgroundColor: '#fff', borderRadius: 15, padding: 2, ...SHADOWS.small },
  name: { fontSize: 26, fontWeight: '900', color: COLORS.dark, letterSpacing: -0.5 },
  expBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 8 },
  expText: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginLeft: 6 },
  socialRow: { flexDirection: 'row', gap: 12, marginTop: 15 },
  socialIconBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 15, alignItems: 'center', ...SHADOWS.soft, position: 'relative' },
  statVal: { fontSize: 18, fontWeight: '900', color: COLORS.dark },
  statLab: { fontSize: 10, fontWeight: '700', color: COLORS.gray, textTransform: 'uppercase', marginTop: 4 },
  statIcon: { position: 'absolute', top: -5, right: -5, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.warning + '20', justifyContent: 'center', alignItems: 'center' },
  roleToggleContainer: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 16, letterSpacing: -0.5 },
  roleToggleBase: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 20, padding: 5 },
  rolePart: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 16, gap: 8 },
  rolePartActive: { backgroundColor: COLORS.primary, ...SHADOWS.medium },
  rolePartText: { fontSize: 15, fontWeight: '700', color: COLORS.gray },
  rolePartTextActive: { color: '#fff' },
  portfolioSection: { marginBottom: 30 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 15 },
  sectionSubtitle: { fontSize: 12, fontWeight: '600', color: COLORS.gray },
  portfolioScroll: { gap: 12 },
  portfolioImg: { width: 160, height: 200, borderRadius: 24, backgroundColor: '#E2E8F0' },
  emptyPortfolio: { height: 120, borderRadius: 24, borderStyle: 'dashed', borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  emptyPortfolioText: { fontSize: 13, color: COLORS.gray, marginTop: 10, fontWeight: '500' },
  menuCard: { backgroundColor: '#fff', borderRadius: 28, padding: 10, ...SHADOWS.soft },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuText: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  menuSubtext: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  version: { textAlign: 'center', marginTop: 40, color: COLORS.placeholder, fontSize: 12, fontWeight: '600' }
});

export default ProfileScreen;
