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
  Linking
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { COLORS, SHADOWS } from '../constants/theme'
import { mapEngine } from '../services/MapEngine'
import { useFocusEffect } from '@react-navigation/native'
import { apiService } from '../services/ApiService'

const ProfileScreen = ({ route, navigation }: any) => {
  const { userId } = route.params || {};
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const { signOut } = useAuth();
  const currentUser = mapEngine.getCurrentUser();
  const isMe = !userId || userId === currentUser?.id || userId === currentUser?.uid;

  const fetchProfile = useCallback(async () => {
    try {
      let userData;
      if (isMe) {
          userData = await mapEngine.syncUser(true);
      } else {
          userData = await mapEngine.getExternalUser(userId);
      }
      setUser(userData);

      // Fetch reviews
      if (userData) {
          // @ts-ignore
          const revRes = await apiService.api.get(`reviews/master/${userData.id}`);
          setReviews(revRes.data);
      }
    } catch (e) {
      logger.error("UI_ERROR", { error: e });
      if (!isMe) Alert.alert("Ошибка", "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }, [userId, isMe]);

  useFocusEffect(
      useCallback(() => {
          fetchProfile();
      }, [fetchProfile])
  );

  const toggleRole = async () => {
    if (!user) return;
    const newRole = user.role === 'EMPLOYER' ? 'WORKER' : 'EMPLOYER';
    try {
        await mapEngine.updateProfile({ role: newRole });
        fetchProfile();
        Alert.alert("Роль изменена", `Теперь вы ${newRole === 'EMPLOYER' ? 'Заказчик' : 'Мастер'}`);
    } catch (e) {
        Alert.alert("Ошибка", "Не удалось сменить роль");
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
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
                        <Ionicons name="pencil" size={14} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
            <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
            <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user?.role === 'EMPLOYER' ? 'Заказчик' : 'Мастер'}</Text>
            </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
                <View style={styles.ratingStars}>
                    <Ionicons name="star" size={12} color={COLORS.warning} />
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

        {/* Portfolio / Reviews Section */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>
                {'Отзывы'}
            </Text>

            {true ? (
                reviews.length > 0 ? (
                    reviews.map((rev) => (
                        <View key={rev.id} style={styles.reviewCard}>
                            <View style={styles.reviewHeader}>
                                <Text style={styles.reviewAuthor}>{rev.author?.name}</Text>
                                <View style={styles.reviewStars}>
                                    {[1,2,3,4,5].map(s => <Ionicons key={s} name={s <= rev.rating ? "star" : "star-outline"} size={12} color={COLORS.warning} />)}
                                </View>
                            </View>
                            <Text style={styles.reviewOrder}>{rev.order?.title}</Text>
                            <Text style={styles.reviewComment}>{rev.comment}</Text>
                            <Text style={styles.reviewDate}>{new Date(rev.createdAt).toLocaleDateString()}</Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.emptyText}>Отзывов пока нет</Text>
                )
            ) : (
                <Text style={styles.bioText}>Использую CeilingsApp для поиска лучших мастеров по натяжным потолкам.</Text>
            )}
        </View>

        {/* Settings / Actions */}
        {isMe ? (
            <View style={styles.actionsContainer}>
                <View style={styles.settingItem}>
                    <View style={styles.settingLeft}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '15' }]}>
                            <Ionicons name="briefcase-outline" size={20} color={COLORS.primary} />
                        </View>
                        <Text style={styles.settingLabel}>Режим мастера</Text>
                    </View>
                    <Switch
                        value={user?.role === 'WORKER'}
                        onValueChange={toggleRole}
                        trackColor={{ false: '#767577', true: COLORS.primary }}
                    />
                </View>

                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Subscription')}>
                    <View style={styles.settingLeft}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.warning + '15' }]}>
                            <Ionicons name="ribbon-outline" size={20} color={COLORS.warning} />
                        </View>
                        <Text style={styles.settingLabel}>Подписка и PRO</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
                    <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
                    <Text style={styles.logoutText}>Выйти из профиля</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <View style={styles.guestActions}>
                <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={async () => {
                        // Create context-less chat (if possible) or directed from order
                        Alert.alert("Чат", "Перейдите в заказ, чтобы начать чат с этим пользователем.");
                    }}
                >
                    <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                    <Text style={styles.messageBtnText}>Написать сообщение</Text>
                </TouchableOpacity>
            </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginTop: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginTop: 15 },
  roleBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  roleText: { fontSize: 12, color: COLORS.gray, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, paddingHorizontal: 20 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#eee' },
  ratingStars: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  section: { marginTop: 40, paddingHorizontal: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark, marginBottom: 15 },
  bioText: { fontSize: 15, color: COLORS.gray, lineHeight: 22 },
  reviewCard: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 15, marginBottom: 12 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewAuthor: { fontSize: 14, fontWeight: 'bold', color: COLORS.dark },
  reviewStars: { flexDirection: 'row' },
  reviewOrder: { fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: '600' },
  reviewComment: { fontSize: 14, color: COLORS.gray, marginTop: 8 },
  reviewDate: { fontSize: 11, color: '#bbb', marginTop: 10 },
  emptyText: { color: '#bbb', fontStyle: 'italic' },
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
  messageBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 }
});

export default ProfileScreen;
