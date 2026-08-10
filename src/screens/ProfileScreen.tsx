import AppIcon from '../components/AppIcon';
import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../services/logger/LoggerService';

import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  Linking,
  Modal
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { COLORS, SHADOWS } from '../constants/theme'
import { mapEngine } from '../services/MapEngine'
import { useFocusEffect } from '@react-navigation/native'
import { apiService } from '../services/ApiService'
import { useClientStore } from '../store/client.store'
import { useRoleSwitch } from '../hooks/useRoleSwitch';
import { storageService } from '../services/StorageService'

const ProfileScreen = ({ route, navigation }: any) => {
  const { userId } = route.params || {};
  const [user, setUser] = useState<any>(null);
  const activeRole = useClientStore(state => state.activeRole);
  const [loading, setLoading] = useState(true);
  const { switchRole, isSwitching } = useRoleSwitch();
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<any[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const { logout, updateUser } = useAuth();
  const currentUser = mapEngine.getCurrentUser();
  const isMe = !userId || userId === currentUser?.id || userId === currentUser?.uid;

  const profileKey = userId || 'me';
  const lastFetchRef = React.useRef<{ [key: string]: number }>({});

  const calculateCompletion = () => {
    let score = 0;
    if (user?.avatar) score += 20;
    if (user?.activeCategoryId) score += 20;
    if (user?.telegram) score += 20;
    if (user?.experience && user.experience > 0) score += 20;
    if (portfolioItems && portfolioItems.length > 0) score += 20;
    return score;
  };

  const completionPercentage = calculateCompletion();

  // App Settings States
  const [pushEnabled, setPushEnabled] = useState(true);
  const [offlineCacheEnabled, setOfflineCacheEnabled] = useState(true);

  const fetchProfile = useCallback(async () => {
    setError(null);
    try {
      let userData;
      if (isMe) {
          userData = await mapEngine.syncUser(true);
          if (userData) {
              updateUser(userData);
              if (userData.role) {
                  useClientStore.getState().setActiveRole(userData.role);
              }
          }
      } else {
          userData = await mapEngine.getExternalUser(userId);
      }
      setUser(userData);

      // Fetch reviews and portfolio
      if (userData) {
          // @ts-ignore
          const revRes = await apiService.api.get(`reviews/master/${userData.id}`);
          setReviews(revRes.data);

          const portRes = await apiService.api.get(`users/${userData.id}/portfolio`);
          setPortfolioItems(portRes.data);
      }
      // Record successful fetch timestamp
      lastFetchRef.current[profileKey] = Date.now();
    } catch (e: any) {
      logger.error("UI_ERROR", { error: e });
      setError(e.message || "Не удалось загрузить данные профиля");
      if (!isMe) Alert.alert("Ошибка", "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }, [userId, isMe, profileKey]);

  useFocusEffect(
      useCallback(() => {
          const now = Date.now();
          const lastFetch = lastFetchRef.current[profileKey] || 0;
          const CACHE_WINDOW = 15000; // 15 seconds guard

          if (now - lastFetch < CACHE_WINDOW) {
              logger.debug('PROFILE_FOCUS_FETCH_SKIPPED', { profileKey, age: now - lastFetch });
              setLoading(false);
              return;
          }

          fetchProfile();
      }, [fetchProfile, profileKey])
  );

  const toggleRole = async () => {
    if (!user || isSwitching) return;
    const newRole = activeRole === 'EMPLOYER' ? 'WORKER' : 'EMPLOYER';
    try {
        await switchRole(newRole, () => {
            fetchProfile();
        });
    } catch (e) {
        // Handled inside switchRole hook
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      "Очистить кэш",
      "Вы уверены, что хотите очистить весь локальный кэш приложения?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Очистить",
          style: "destructive",
          onPress: () => {
            storageService.clearAll();
            Alert.alert("Кэш очищен", "Локальный кэш приложения успешно очищен.");
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Удалить аккаунт",
      "Ваш аккаунт будет деактивирован, вход станет невозможен. История ваших заказов, чатов и отзывов сохранится для других участников платформы — это необходимо для целостности маркетплейса. Отменить это действие будет нельзя.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить навсегда",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              setShowSettingsModal(false);
              await apiService.api.delete('users/profile');
              storageService.clearAll();
              await logout();
            } catch (error: any) {
              Alert.alert("Ошибка", "Не удалось удалить аккаунт: " + (error.message || "произошла ошибка"));
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  if (error || !user) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <AppIcon name="status-warning" size={64} color={COLORS.danger} style={{ marginBottom: 20 }} />
        <Text style={[styles.name, { marginBottom: 20, textAlign: 'center', paddingHorizontal: 30 }]}>{error || "Профиль не найден"}</Text>
        <TouchableOpacity
          style={[styles.mainActionBtn, { paddingHorizontal: 30 }]}
          onPress={() => {
            setLoading(true);
            fetchProfile();
          }}
        >
          <Text style={styles.mainActionText}>Повторить попытку</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Bar with Settings Gear */}
      <View style={styles.topHeaderBar}>
          <Text style={styles.topHeaderTitle}>Профиль</Text>
          {isMe && (
              <TouchableOpacity onPress={() => setShowSettingsModal(true)} style={styles.settingsIconBtn}>
                  <AppIcon name="settings-outline" size={24} color={COLORS.dark} />
              </TouchableOpacity>
          )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Main Profile Info Header */}
        <View style={styles.header}>
            <View style={styles.avatarContainer}>
                {user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarText}>{(user?.name || 'U')[0]}</Text>
                    </View>
                )}
                {isMe && (
                    <TouchableOpacity style={styles.editBadge} onPress={() => navigation.navigate('EditProfile')}>
                        <AppIcon name="action-edit" size={14} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
            <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
            <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{activeRole === 'EMPLOYER' ? 'Заказчик' : 'Мастер'}</Text>
            </View>

            {/* Profile Completion Indicator (WORKER only) */}
            {activeRole === 'WORKER' && (
                <View style={styles.completionContainer}>
                    <Text style={styles.completionLabel}>Профиль заполнен на {completionPercentage}%</Text>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${completionPercentage}%` }]} />
                    </View>
                </View>
            )}

            {/* Social Links Icons */}
            {(user?.telegram || user?.instagram) && (
                <View style={styles.socialRow}>
                    {user.telegram && (
                        <TouchableOpacity
                            style={styles.socialIconBtn}
                            onPress={() => Linking.openURL(`https://t.me/${user.telegram.replace('@', '')}`)}
                        >
                            <AppIcon name="action-send" size={18} color="#0088cc" />
                            <Text style={styles.socialText}>Telegram</Text>
                        </TouchableOpacity>
                    )}
                    {user.instagram && (
                        <TouchableOpacity
                            style={styles.socialIconBtn}
                            onPress={() => Linking.openURL(user.instagram.startsWith('http') ? user.instagram : `https://instagram.com/${user.instagram}`)}
                        >
                            <AppIcon name="logo-instagram" size={18} color="#e1306c" />
                            <Text style={styles.socialText}>Instagram</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>

        {/* User Bio Description */}
        {user?.description && (
            <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionText}>{user.description}</Text>
            </View>
        )}

        {/* Trust Score & Verification Card */}
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => isMe && navigation.navigate('Verification')}
            style={styles.trustCard}
        >
            <View style={styles.trustHeader}>
                <AppIcon name={user?.isVerified ? "sys-verified" : "sys-shield"}
                    size={18}
                    color={user?.isVerified ? '#10B981' : COLORS.warning}
                />
                <Text style={styles.trustCardLabel}>Индекс доверия:</Text>
                <Text style={[styles.trustCardVal, { color: (user?.trustScore || 50) >= 80 ? '#10B981' : COLORS.warning }]}>
                    {user?.trustScore || 50}/100
                </Text>
            </View>
            <Text style={styles.trustCardDesc}>
                {user?.isVerified ? "Профиль верифицирован (аккаунт подтвержден)" : "Профиль не верифицирован. Нажмите, чтобы подтвердить личность."}
            </Text>
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
                <View style={styles.ratingStars}>
                    <AppIcon name="sys-rating" size={12} color={COLORS.warning} />
                    <Text style={styles.statLabel}>Рейтинг</Text>
                </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.completedOrders || 0}</Text>
                <Text style={styles.statLabel}>Заказов</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.experience || 0}г.</Text>
                <Text style={styles.statLabel}>Опыт</Text>
            </View>
        </View>

        {/* Portfolio Section (Workers only) */}
        {activeRole === 'WORKER' && (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Портфолио</Text>
                {portfolioItems.length > 0 ? (
                    <View style={styles.portfolioGrid}>
                        {portfolioItems.map((item: any) => (
                            <View key={item.id} style={styles.portfolioItemContainer}>
                                <Image source={{ uri: item.imageUrl }} style={styles.portfolioImage} />
                                {item.description && (
                                    <Text style={styles.portfolioDesc} numberOfLines={1}>{item.description}</Text>
                                )}
                            </View>
                        ))}
                    </View>
                ) : (
                    <Text style={styles.emptyText}>Фото в портфолио пока не добавлены</Text>
                )}
            </View>
        )}

        {/* Reviews Section */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Отзывы</Text>
            {reviews.length > 0 ? (
                reviews.map((rev) => (
                    <View key={rev.id} style={styles.reviewCard}>
                        <View style={styles.reviewHeader}>
                            <Text style={styles.reviewAuthor}>{rev.author?.name}</Text>
                            <View style={styles.reviewStars}>
                                {[1,2,3,4,5].map(s => <AppIcon key={s} name={s <= rev.rating ? "sys-rating" : "sys-rating"} size={12} color={COLORS.warning} />)}
                            </View>
                        </View>
                        <Text style={styles.reviewOrder}>{rev.order?.title}</Text>
                        <Text style={styles.reviewComment}>{rev.comment}</Text>
                        <Text style={styles.reviewDate}>{new Date(rev.createdAt).toLocaleDateString()}</Text>
                    </View>
                ))
            ) : (
                <Text style={styles.emptyText}>Отзывов пока нет</Text>
            )}
        </View>

        {/* Bottom Navigation Quick Edit Profile (If Me) */}
        {isMe && (
            <View style={{ paddingHorizontal: 24, marginTop: 30 }}>
                <TouchableOpacity
                    style={styles.mainActionBtn}
                    onPress={() => navigation.navigate('EditProfile')}
                >
                    <AppIcon name="action-edit" size={20} color="#fff" />
                    <Text style={styles.mainActionText}>Редактировать профиль</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Settings / Actions */}
        {isMe ? (
            <View style={styles.actionsContainer}>
                <View style={styles.settingItem}>
                    <View style={styles.settingLeft}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '15' }]}>
                            <AppIcon name="role-employer" size={20} color={COLORS.primary} />
                        </View>
                        <Text style={styles.settingLabel}>Режим мастера</Text>
                    </View>
                    <Switch
                        value={activeRole === 'WORKER'}
                        onValueChange={toggleRole}
                        disabled={isSwitching}
                        trackColor={{ false: '#767577', true: COLORS.primary }}
                    />
                </View>

                {activeRole === 'WORKER' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CategorySelection')}>
                        <View style={styles.settingLeft}>
                            <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '15' }]}>
                                <AppIcon name="sys-compass" size={20} color={COLORS.primary} />
                            </View>
                            <Text style={styles.settingLabel}>Сменить направление</Text>
                        </View>
                        <AppIcon name="nav-forward" size={20} color={COLORS.gray} />
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Subscription')}>
                    <View style={styles.settingLeft}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.warning + '15' }]}>
                            <AppIcon name="sys-premium" size={20} color={COLORS.warning} />
                        </View>
                        <Text style={styles.settingLabel}>Подписка и PRO</Text>
                    </View>
                    <AppIcon name="nav-forward" size={20} color={COLORS.gray} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Verification')}>
                    <View style={styles.settingLeft}>
                        <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '15' }]}>
                            <AppIcon name="status-done" size={20} color="#10B981" />
                        </View>
                        <Text style={styles.settingLabel}>Верификация личности</Text>
                    </View>
                    <AppIcon name="nav-forward" size={20} color={COLORS.gray} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                    <AppIcon name="sys-logout" size={20} color={COLORS.danger} />
                    <Text style={styles.logoutText}>Выйти из профиля</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <View style={styles.guestActions}>
                <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={async () => {
                        Alert.alert("Чат", "Перейдите в заказ, чтобы начать чат с этим пользователем.");
                    }}
                >
                    <AppIcon name="action-chat" size={20} color="#fff" />
                    <Text style={styles.messageBtnText}>Написать сообщение</Text>
                </TouchableOpacity>
            </View>
        )}
      </ScrollView>

      {/* Application Settings Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSettingsModal}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Настройки приложения</Text>
                    <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                        <AppIcon name="nav-close" size={28} color={COLORS.gray} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                    <Text style={styles.modalSectionTitle}>Основные настройки</Text>

                    <View style={styles.modalSettingRow}>
                        <Text style={styles.modalSettingLabel}>Пуш-уведомления</Text>
                        <Switch
                            value={pushEnabled}
                            onValueChange={setPushEnabled}
                            trackColor={{ false: '#767577', true: COLORS.primary }}
                        />
                    </View>

                    <View style={styles.modalSettingRow}>
                        <Text style={styles.modalSettingLabel}>Оффлайн кэширование карт</Text>
                        <Switch
                            value={offlineCacheEnabled}
                            onValueChange={setOfflineCacheEnabled}
                            trackColor={{ false: '#767577', true: COLORS.primary }}
                        />
                    </View>

                    <View style={styles.modalSettingRow}>
                        <Text style={styles.modalSettingLabel}>Язык интерфейса</Text>
                        <Text style={styles.modalValueText}>Русский</Text>
                    </View>

                    <View style={styles.modalSettingRow}>
                        <Text style={styles.modalSettingLabel}>Тема оформления</Text>
                        <Text style={styles.modalValueText}>Светлая</Text>
                    </View>

                    <Text style={styles.modalSectionTitle}>Обслуживание</Text>

                    <TouchableOpacity style={styles.modalBtn} onPress={handleClearCache}>
                        <AppIcon name="action-delete" size={20} color={COLORS.dark} style={{ marginRight: 10 }} />
                        <Text style={styles.modalBtnText}>Очистить локальный кэш</Text>
                    </TouchableOpacity>

                    <Text style={styles.modalSectionTitle}>Опасная зона</Text>

                    <TouchableOpacity style={[styles.modalBtn, styles.dangerBtn]} onPress={handleDeleteAccount}>
                        <AppIcon name="action-delete" size={20} color="#fff" style={{ marginRight: 10 }} />
                        <Text style={styles.dangerBtnText}>УДАЛИТЬ АККАУНТ</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.modalFooter}>
                    <Text style={styles.versionText}>CeilingsApp v1.2.0 • Разработано для App Store</Text>
                </View>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  completionContainer: { width: '80%', marginTop: 15, alignItems: 'center' },
  completionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 6 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  topHeaderTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark },
  settingsIconBtn: { padding: 5 },
  header: { alignItems: 'center', marginTop: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginTop: 15 },
  roleBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  roleText: { fontSize: 12, color: COLORS.gray, fontWeight: 'bold' },
  socialRow: { flexDirection: 'row', gap: 15, marginTop: 15, justifyContent: 'center' },
  socialIconBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, gap: 6 },
  socialText: { fontSize: 13, fontWeight: '700', color: COLORS.dark },
  descriptionContainer: { paddingHorizontal: 24, marginTop: 20, alignItems: 'center' },
  descriptionText: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, paddingHorizontal: 20 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#eee' },
  ratingStars: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  section: { marginTop: 40, paddingHorizontal: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 15 },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 },
  portfolioItemContainer: { width: '47%', backgroundColor: '#f9f9f9', borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
  portfolioImage: { width: '100%', height: 120, resizeMode: 'cover' },
  portfolioDesc: { padding: 8, fontSize: 12, color: COLORS.dark, fontWeight: '600' },
  reviewCard: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 15, marginBottom: 12 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewAuthor: { fontSize: 14, fontWeight: 'bold', color: COLORS.dark },
  reviewStars: { flexDirection: 'row' },
  reviewOrder: { fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: '600' },
  reviewComment: { fontSize: 14, color: COLORS.gray, marginTop: 8 },
  reviewDate: { fontSize: 11, color: '#bbb', marginTop: 10 },
  emptyText: { color: '#bbb', fontStyle: 'italic' },
  mainActionBtn: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.medium },
  mainActionText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionsContainer: { marginTop: 40, paddingHorizontal: 20 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  settingIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  settingLabel: { fontSize: 16, color: COLORS.dark, fontWeight: '500' },
  actionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, paddingVertical: 15 },
  logoutText: { color: COLORS.danger, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  guestActions: { paddingHorizontal: 20, marginTop: 30 },
  messageBtn: { backgroundColor: COLORS.primary, height: 55, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  messageBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '80%', padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark },
  modalScroll: { marginBottom: 20 },
  modalSectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, marginTop: 15, marginBottom: 12 },
  modalSettingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalSettingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  modalValueText: { fontSize: 15, color: COLORS.gray, fontWeight: '700' },
  modalBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  dangerBtn: { backgroundColor: COLORS.danger, padding: 15, borderRadius: 15, justifyContent: 'center', marginTop: 15, borderBottomWidth: 0 },
  dangerBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  modalFooter: { alignItems: 'center', marginTop: 10, paddingBottom: 10 },
  versionText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  trustCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.4)'
  },
  trustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  trustCardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
    marginLeft: 6,
    flex: 1
  },
  trustCardVal: {
    fontSize: 15,
    fontWeight: '900'
  },
  trustCardDesc: {
    fontSize: 12,
    color: COLORS.gray,
    lineHeight: 16,
    fontWeight: '500'
  }
});

export default ProfileScreen;