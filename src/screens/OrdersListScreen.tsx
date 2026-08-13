import AppIcon, { IconName } from '../components/AppIcon';
import React, { useState, useEffect, useMemo } from 'react';

import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Alert,
  ScrollView,
  ActivityIndicator
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { mapEngine } from '../services/MapEngine'
import { logger } from '../services/logger/LoggerService'
import { Order, OrderStatus, WorkType } from '../types'
import { COLORS, SHADOWS } from '../constants/theme'
import { OrderCard } from '../components/OrderCard'

const FILTERS: {
  STATUS: { id: string; label: string }[];
  WORK_TYPE: { id: string; label: string }[];
  SORT: { id: string; label: string; icon: IconName }[];
  DATE: { id: string; label: string }[];
} = {
  STATUS: [
    { id: 'all', label: 'Все' },
    { id: 'PUBLISHED', label: 'Ожидает' },
    { id: 'HAS_RESPONSES', label: 'Отклики' },
    { id: 'CLAIMED', label: 'Выбран' },
    { id: 'IN_PROGRESS', label: 'В работе' },
  ],
  WORK_TYPE: [
    { id: 'all', label: 'Все типы' },
    { id: 'INSTALLATION', label: 'Монтаж' },
    { id: 'SERVICE', label: 'Сервис' },
    { id: 'FROZE', label: 'Замер' },
    { id: 'REPAIR', label: 'Ремонт' },
    { id: 'OTHER', label: 'Другое' },
  ],
  SORT: [
    { id: 'newest', label: 'Сначала новые', icon: 'action-sort-down' },
    { id: 'oldest', label: 'Сначала старые', icon: 'action-sort-up' },
  ],
  DATE: [
    { id: 'all', label: 'Все даты' },
    { id: 'today', label: 'Сегодня' },
    { id: 'tomorrow', label: 'Завтра' },
    { id: 'week', label: 'Эта неделя' },
  ]
};

const OrdersListScreen = ({ navigation }: any) => {
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [orders, setOrders] = useState<Order[]>(mapEngine.getOrders(true));
  const [currentUser, setCurrentUser] = useState(mapEngine.getCurrentUser());
  const [loading, setLoading] = useState(!mapEngine.entityStore.isMyOrdersLoaded);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    logger.debug('ORDERS_LIST_MOUNT', { source: 'ui' });
    const unsubscribe = mapEngine.subscribe(() => {
      setOrders(mapEngine.getOrders(true));
    }, 'OrdersListScreen');

    return () => {
        logger.debug('ORDERS_LIST_UNMOUNT', { source: 'ui' });
        unsubscribe();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // V11: Only update local state if mounted to prevent memory leaks/zombie state
      setOrders(mapEngine.getOrders(true));

      const user = mapEngine.getCurrentUser();
      if (user) setCurrentUser(user);
      else mapEngine.syncUser().then(setCurrentUser);

      if (!mapEngine.entityStore.isMyOrdersLoaded) {
        setLoading(true);
        setError(null);
        setHasMore(true);
        mapEngine.syncMyOrders({ skip: 0, take: 50 })
          .then(() => setLoading(false))
          .catch((e: any) => {
             setError(e.message || "Не удалось загрузить список заказов");
             setLoading(false);
          });
      } else {
        setLoading(false);
      }
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    await Promise.all([
      mapEngine.syncMyOrders({ skip: 0, take: 50 }),
      mapEngine.syncUser(true)
    ]);
    setRefreshing(false);
  };

  const filteredOrders = useMemo(() => {
    const myId = currentUser?.uid || (currentUser as any)?.id;
    let result = orders.filter(order => {
      if (order.status === 'CANCELLED') return false;

      const isMyOrder = order.employerId === myId;
      const amIExecutor = order.executorId === myId;

      const someoneElseSelected = (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS' || order.status === 'COMPLETED') && !amIExecutor;
      const iApplied = order.applications?.some(a => (a.executorId === myId)) && !someoneElseSelected;

      if (activeTab === 'archive') {
          if (order.status !== 'COMPLETED') return false;
          if (!isMyOrder && !amIExecutor) return false;
      } else {
          if (order.status === 'COMPLETED') return false;
          if (!isMyOrder && !amIExecutor && !iApplied) return false;
      }

      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (workTypeFilter !== 'all' && order.workType !== workTypeFilter) return false;

      if (dateFilter !== 'all') {
          const orderDate = new Date(order.date);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          const nextWeek = new Date(today);
          nextWeek.setDate(today.getDate() + 7);

          if (dateFilter === 'today') {
              if (orderDate < today || orderDate >= tomorrow) return false;
          } else if (dateFilter === 'tomorrow') {
              const dayAfterTomorrow = new Date(tomorrow);
              dayAfterTomorrow.setDate(tomorrow.getDate() + 1);
              if (orderDate < tomorrow || orderDate >= dayAfterTomorrow) return false;
          } else if (dateFilter === 'week') {
              if (orderDate < today || orderDate > nextWeek) return false;
          }
      }

      return true;
    });

    result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [orders, activeTab, statusFilter, workTypeFilter, sortOrder, currentUser]);

  const sections = useMemo(() => {
    const grouped: Record<string, Order[]> = {
      'Сегодня': [],
      'В работе': [],
      'Ждут решения': [],
      'Завершенные': [],
    };

    filteredOrders.forEach(order => {
      const status = order.status;
      let sectionName = 'Ждут решения';

      if (status === 'COMPLETED' || status === 'REVIEWED' || status === 'CANCELLED' || (status as any) === 'CANCELLED') {
        sectionName = 'Завершенные';
      } else {
        const orderDate = new Date(order.date);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayStart.getDate() + 1);
        const isToday = orderDate >= todayStart && orderDate < todayEnd;

        if (isToday) {
          sectionName = 'Сегодня';
        } else if (status === 'IN_PROGRESS') {
          sectionName = 'В работе';
        } else {
          sectionName = 'Ждут решения';
        }
      }

      grouped[sectionName].push(order);
    });

    return [
      { title: 'Сегодня', data: grouped['Сегодня'] },
      { title: 'В работе', data: grouped['В работе'] },
      { title: 'Ждут решения', data: grouped['Ждут решения'] },
      { title: 'Завершенные', data: grouped['Завершенные'] },
    ].filter(section => section.data.length > 0);
  }, [filteredOrders]);

  const loadMoreOrders = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const skip = mapEngine.entityStore.getMyOrders().length;
      const take = 50;
      const res = await mapEngine.syncMyOrders({ skip, take });
      if (res && res.length < take) {
        setHasMore(false);
      }
    } catch (e) {
      logger.error('UI_ERROR', { error: 'Load more my orders failed:', e });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = (orderId: string) => {
    if (submitting) return;

    Alert.alert(
      'Удаление заказа',
      'Заказ будет удален навсегда. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(orderId);
            try {
              await mapEngine.deleteOrder(orderId);
              setOrders(mapEngine.getOrders(true));
            } catch (e) {
              Alert.alert('Ошибка', 'Не удалось удалить заказ');
            } finally {
                setSubmitting(null);
            }
          }
        }
      ]
    );
  };

  const handleStartWork = async (orderId: string) => {
    const target = orders.find(o => o.id === orderId);
    if (submitting || target?.status !== 'CLAIMED') return;

    setSubmitting(orderId);
    try {
      await mapEngine.startOrder(orderId);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось начать работу');
    } finally {
        setSubmitting(null);
    }
  };

  const handleCompleteWork = async (orderId: string) => {
    const target = orders.find(o => o.id === orderId);
    if (submitting || target?.status !== 'IN_PROGRESS') return;

    setSubmitting(orderId);
    try {
      await mapEngine.completeOrder(orderId);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось завершить работу');
    } finally {
        setSubmitting(null);
    }
  };

  const handleCancelApplication = async (orderId: string) => {
      if (submitting) return;
      setSubmitting(orderId);
      try {
          await mapEngine.cancelApplication(orderId);
      } catch (e: any) {
          Alert.alert('Ошибка', e.response?.data?.message || 'Не удалось отменить отклик');
      } finally {
          setSubmitting(null);
      }
  }

  const renderFilterChip = (item: { id: string, label: string }, current: string, setter: (v: string) => void) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.chip, current === item.id && styles.chipActive]}
      onPress={() => setter(item.id)}
    >
      <Text style={[styles.chipText, current === item.id && styles.chipTextActive]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  if (loading && filteredOrders.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  if (error && filteredOrders.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <AppIcon name="status-warning" size={64} color={COLORS.danger} style={{ marginBottom: 20 }} />
        <Text style={[styles.headerTitle, { fontSize: 18, marginBottom: 20, textAlign: 'center', paddingHorizontal: 30 }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.sortButton, { paddingHorizontal: 20, paddingVertical: 12 }]}
          onPress={() => {
            setLoading(true);
            setError(null);
            setHasMore(true);
            mapEngine.syncMyOrders({ skip: 0, take: 50 })
              .then(() => setLoading(false))
              .catch((err: any) => {
                 setError(err.message || "Не удалось загрузить список заказов");
                 setLoading(false);
              });
          }}
        >
          <Text style={styles.sortButtonText}>Повторить попытку</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Мои заказы</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.tabActive]}
            onPress={() => {
                setActiveTab('active');
                setStatusFilter('all');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Активные</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
            onPress={() => {
                setActiveTab('archive');
                setStatusFilter('all');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>Архив</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          >
            <AppIcon name={FILTERS.SORT.find(s => s.id === sortOrder)?.icon ?? 'action-sort-down'}
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.sortButtonText}>
              {sortOrder === 'newest' ? 'Новые' : 'Старые'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {activeTab === 'active' && FILTERS.STATUS.map(f => renderFilterChip(f, statusFilter, setStatusFilter))}

          {activeTab === 'active' && <View style={styles.divider} />}

          {FILTERS.WORK_TYPE.map(f => renderFilterChip(f, workTypeFilter, setWorkTypeFilter))}

          <View style={styles.divider} />

          {FILTERS.DATE.map(f => renderFilterChip(f, dateFilter, setDateFilter))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            isEmployer={item.employerId === (currentUser?.uid || (currentUser as any)?.id)}
            currentUserId={currentUser?.uid || (currentUser as any)?.id}
            hasApplied={item.applications?.some(a => a.executorId === (currentUser?.uid || (currentUser as any)?.id))}
            submitting={submitting === item.id}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            onDelete={() => handleDelete(item.id)}
            onEdit={() => navigation.navigate('EditOrder', { orderId: item.id })}
            onStart={() => handleStartWork(item.id)}
            onComplete={() => handleCompleteWork(item.id)}
            onChat={() => navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: item.id } })}
            onCancelApplication={() => {
              Alert.alert('Отмена отклика', 'Вы уверены?', [
                { text: 'Нет' },
                { text: 'Да', onPress: () => handleCancelApplication(item.id) }
              ]);
            }}
          />
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>{title}</Text>
          </View>
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        onEndReached={loadMoreOrders}
        onEndReachedThreshold={0.3}
        ListFooterComponent={() => {
          if (!loadingMore) return null;
          return (
            <View style={{ paddingVertical: 15, alignItems: 'center' }}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppIcon name="sys-document" size={64} color={COLORS.border} />
            <Text style={styles.emptyText}>Заказов не найдено</Text>
            <Text style={styles.emptySubtext}>Попробуйте изменить фильтры или вкладку</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#fff' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: COLORS.dark, marginBottom: 15, letterSpacing: -0.5 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 15
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10
  },
  tabActive: {
    backgroundColor: '#fff',
    ...SHADOWS.soft
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray
  },
  tabTextActive: {
    color: COLORS.primary },
  filtersWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9' },
  filtersScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent' },
  chipActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: '700' },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6 },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4 },
  list: { padding: 16, paddingBottom: 100 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 40
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.dark,
    marginTop: 20
  },
  emptySubtext: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 8
  },
  sectionHeader: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 15,
    marginBottom: 5
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1
  }
});

export default OrdersListScreen;
