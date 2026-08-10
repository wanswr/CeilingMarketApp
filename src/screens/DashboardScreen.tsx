import AppIcon from '../components/AppIcon';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../services/ApiService';
import { COLORS, SHADOWS, SPACING } from '../constants/theme';
import { logger } from '../services/logger/LoggerService';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate } from '../utils/date';

export default function DashboardScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const res = await apiService.getDashboard();
      setData(res.data);
    } catch (e: any) {
      logger.error('[DashboardScreen] Failed to load dashboard data', { error: e.message });
      setError('Не удалось загрузить данные дашборда. Проверьте интернет-соединение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.background }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Загрузка центра управления...</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.background, padding: 30 }]}>
        <AppIcon name="status-offline" size={64} color={COLORS.danger} style={{ marginBottom: 20 }} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchDashboard(); }}>
          <Text style={styles.retryText}>Повторить попытку</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { role, user, stats, actionRequired, relevantOrders, unreadChatsCount, unreadNotificationsCount } = data || {};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Welcome Header Card */}
        <View style={[styles.card, styles.welcomeCard]}>
          <View style={styles.welcomeRow}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.greeting}>Привет, {user?.name || 'Пользователь'} 👋</Text>
              <Text style={styles.subGreeting}>Рады видеть тебя снова</Text>
            </View>
            <TouchableOpacity style={styles.bellBtn} onPress={() => Alert.alert('Уведомления', 'У вас нет новых системных уведомлений.')}>
              <AppIcon name="notifications-outline" size={22} color={COLORS.dark} />
              {unreadNotificationsCount > 0 && <View style={styles.badge} />}
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Trust Index Info */}
          <View style={styles.trustRow}>
            <AppIcon name="sys-verified" size={24} color="#10B981" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.trustLabel}>Индекс доверия профиля</Text>
              <Text style={styles.trustDesc}>На основе верификации и отзывов</Text>
            </View>
            <Text style={[styles.trustValue, { color: user?.trustScore >= 80 ? '#10B981' : COLORS.warning }]}>
              {user?.trustScore || 50}/100
            </Text>
          </View>
        </View>

        {/* Unread Chats Banner */}
        {unreadChatsCount > 0 && (
          <TouchableOpacity
            style={[styles.card, styles.chatWarningCard]}
            onPress={() => navigation.navigate('Chats')}
          >
            <AppIcon name="tab-chats" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <Text style={styles.chatWarningText}>
              У вас {unreadChatsCount} {unreadChatsCount === 1 ? 'непрочитанное сообщение' : unreadChatsCount < 5 ? 'непрочитанных сообщения' : 'непрочитанных сообщений'}
            </Text>
            <AppIcon name="nav-forward" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {/* Stats Grid */}
        <View style={styles.statsRow}>
          {role === 'EMPLOYER' ? (
            <>
              <View style={[styles.card, styles.statCard, { flex: 1 }]}>
                <Text style={styles.statVal}>{stats?.activeOrders || 0}</Text>
                <Text style={styles.statTitle}>Заказов в работе</Text>
              </View>
              <View style={[styles.card, styles.statCard, { flex: 1, marginLeft: 15 }]}>
                <Text style={styles.statVal}>{stats?.totalCreated || 0}</Text>
                <Text style={styles.statTitle}>Всего создано</Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.card, styles.statCard, { flex: 1 }]}>
                <Text style={styles.statVal}>{stats?.completedOrders || 0}</Text>
                <Text style={styles.statTitle}>Выполнено заказов</Text>
              </View>
              <View style={[styles.card, styles.statCard, { flex: 1, marginLeft: 15 }]}>
                <Text style={styles.statVal}>{stats?.experience || 0}г.</Text>
                <Text style={styles.statTitle}>Профессиональный стаж</Text>
              </View>
            </>
          )}
        </View>

        {/* Action Required Section */}
        <Text style={styles.sectionTitle}>Требует действий</Text>

        {role === 'EMPLOYER' ? (
          <>
            {/* Orders with applications */}
            {actionRequired?.ordersWithResponses?.length > 0 ? (
              actionRequired.ordersWithResponses.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.actionCard]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.actionCardHeader}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{ord.title}</Text>
                    <View style={styles.actionBadgePending}>
                      <Text style={styles.actionBadgeText}>Есть отклики</Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardSubtitle}>Новые заявки от мастеров ждут вашего решения.</Text>
                  <View style={styles.actionCardFooter}>
                    <Text style={styles.actionCardFooterText}>{ord.applications.length} {ord.applications.length === 1 ? 'отклик' : 'отклика'}</Text>
                    <AppIcon name="nav-forward" size={16} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              ))
            ) : null}

            {/* Pending reviews */}
            {actionRequired?.ordersPendingReview?.length > 0 ? (
              actionRequired.ordersPendingReview.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.actionCard, { borderLeftColor: COLORS.warning, borderLeftWidth: 4 }]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.actionCardHeader}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{ord.title}</Text>
                    <View style={[styles.actionBadgePending, { backgroundColor: COLORS.warning + '20' }]}>
                      <Text style={[styles.actionBadgeText, { color: COLORS.warning }]}>Оценить работу</Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardSubtitle}>Заказ завершен. Пожалуйста, оставьте отзыв об исполнителе.</Text>
                  <View style={styles.actionCardFooter}>
                    <Text style={[styles.actionCardFooterText, { color: COLORS.warning }]}>Написать отзыв</Text>
                    <AppIcon name="sys-rating" size={16} color={COLORS.warning} />
                  </View>
                </TouchableOpacity>
              ))
            ) : null}

            {/* In Progress / Active */}
            {actionRequired?.activeOrders?.length > 0 ? (
              actionRequired.activeOrders.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.actionCard, { borderLeftColor: COLORS.success, borderLeftWidth: 4 }]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.actionCardHeader}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{ord.title}</Text>
                    <View style={[styles.actionBadgePending, { backgroundColor: COLORS.success + '20' }]}>
                      <Text style={[styles.actionBadgeText, { color: COLORS.success }]}>
                        {ord.status === 'IN_PROGRESS' ? 'В процессе' : 'Принят'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardSubtitle}>Исполнитель: {ord.executor?.name || 'Мастер'}</Text>
                  <View style={styles.actionCardFooter}>
                    <Text style={[styles.actionCardFooterText, { color: COLORS.success }]}>Открыть детали заказа</Text>
                    <AppIcon name="nav-forward" size={16} color={COLORS.success} />
                  </View>
                </TouchableOpacity>
              ))
            ) : null}

            {(!actionRequired?.ordersWithResponses?.length && !actionRequired?.ordersPendingReview?.length && !actionRequired?.activeOrders?.length) && (
              <View style={[styles.card, styles.emptyCard]}>
                <AppIcon name="sys-premium" size={32} color={COLORS.gray} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyCardText}>На данный момент активных задач нет.</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Active jobs (Claimed / In Progress) */}
            {actionRequired?.activeJobs?.length > 0 ? (
              actionRequired.activeJobs.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.actionCard, { borderLeftColor: COLORS.primary, borderLeftWidth: 4 }]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.actionCardHeader}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{ord.title}</Text>
                    <View style={[styles.actionBadgePending, { backgroundColor: COLORS.primary + '20' }]}>
                      <Text style={[styles.actionBadgeText, { color: COLORS.primary }]}>
                        {ord.status === 'IN_PROGRESS' ? 'В процессе' : 'Принят'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardSubtitle}>Заказчик: {ord.employer?.name || 'Заказчик'}</Text>
                  <View style={styles.actionCardFooter}>
                    <Text style={[styles.actionCardFooterText, { color: COLORS.primary }]}>
                      {ord.status === 'IN_PROGRESS' ? 'Завершить выполнение' : 'Начать работу'}
                    </Text>
                    <AppIcon name="status-active" size={16} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              ))
            ) : null}

            {/* Jobs pending review */}
            {actionRequired?.jobsPendingReview?.length > 0 ? (
              actionRequired.jobsPendingReview.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.actionCard, { borderLeftColor: COLORS.warning, borderLeftWidth: 4 }]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.actionCardHeader}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{ord.title}</Text>
                    <View style={[styles.actionBadgePending, { backgroundColor: COLORS.warning + '20' }]}>
                      <Text style={[styles.actionBadgeText, { color: COLORS.warning }]}>Оценить заказчика</Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardSubtitle}>Вы успешно завершили работу. Пожалуйста, оцените заказчика.</Text>
                  <View style={styles.actionCardFooter}>
                    <Text style={[styles.actionCardFooterText, { color: COLORS.warning }]}>Оставить отзыв</Text>
                    <AppIcon name="sys-rating" size={16} color={COLORS.warning} />
                  </View>
                </TouchableOpacity>
              ))
            ) : null}

            {(!actionRequired?.activeJobs?.length && !actionRequired?.jobsPendingReview?.length) && (
              <View style={[styles.card, styles.emptyCard]}>
                <AppIcon name="sys-premium" size={32} color={COLORS.gray} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyCardText}>На данный момент нет активных задач.</Text>
              </View>
            )}
          </>
        )}

        {/* Hot / Relevant Orders (WORKERS only) */}
        {role === 'WORKER' && (
          <>
            <Text style={styles.sectionTitle}>Рекомендуемые заказы</Text>
            {relevantOrders?.length > 0 ? (
              relevantOrders.map((ord: any) => (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.card, styles.relevantCard]}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: ord.id })}
                >
                  <View style={styles.relevantHeader}>
                    <Text style={styles.relevantTitle} numberOfLines={1}>{ord.title}</Text>
                    <Text style={styles.relevantPrice}>{ord.price} ₽</Text>
                  </View>
                  <Text style={styles.relevantAddress} numberOfLines={1}>📍 {ord.address}</Text>
                  <View style={styles.relevantFooter}>
                    <Text style={styles.relevantDate}>{formatDate(ord.date)}</Text>
                    <View style={styles.relevantActionBtn}>
                      <Text style={styles.relevantActionText}>Подробнее</Text>
                      <AppIcon name="nav-forward" size={14} color="#fff" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={[styles.card, styles.emptyCard]}>
                <AppIcon name="sys-compass" size={32} color={COLORS.gray} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyCardText}>В вашей категории пока нет свободных заказов.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20 },
  loadingText: { marginTop: 15, fontSize: 16, color: COLORS.gray, fontWeight: '600' },
  errorText: { fontSize: 16, color: COLORS.dark, textAlign: 'center', marginBottom: 20, fontWeight: '500' },
  retryBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, ...SHADOWS.soft },
  retryText: { color: '#fff', fontWeight: 'bold' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 15,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.4)'
  },
  welcomeCard: {
    backgroundColor: '#fff'
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.secondary
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarPlaceholderText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold'
  },
  greeting: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark
  },
  subGreeting: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
    fontWeight: '500'
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    position: 'absolute',
    top: 12,
    right: 12
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  trustLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.dark
  },
  trustDesc: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2
  },
  trustValue: {
    fontSize: 18,
    fontWeight: '900'
  },
  chatWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: COLORS.primary + '30',
    borderWidth: 1,
    backgroundColor: COLORS.primary + '05',
    paddingVertical: 14
  },
  chatWarningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 10
  },
  statCard: {
    padding: 16,
    alignItems: 'flex-start'
  },
  statVal: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.dark
  },
  statTitle: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
    fontWeight: '600'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    marginVertical: 15,
    marginLeft: 4
  },
  actionCard: {
    borderColor: 'transparent',
    borderWidth: 1
  },
  actionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark,
    flex: 1,
    marginRight: 10
  },
  actionBadgePending: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '20'
  },
  actionBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700'
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 18,
    marginBottom: 12
  },
  actionCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  actionCardFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary
  },
  emptyCard: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0
  },
  emptyCardText: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '600',
    textAlign: 'center'
  },
  relevantCard: {
    padding: 16
  },
  relevantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  relevantTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark,
    flex: 1,
    marginRight: 10
  },
  relevantPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary
  },
  relevantAddress: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 12,
    fontWeight: '500'
  },
  relevantFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  relevantDate: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '600'
  },
  relevantActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4
  },
  relevantActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800'
  }
});
