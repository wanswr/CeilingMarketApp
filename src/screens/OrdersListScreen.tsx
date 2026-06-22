import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Linking,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mapEngine } from '../services/MapEngine';
import { Order, OrderStatus, WorkType } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';
import { OrderCard } from '../components/OrderCard';

const FILTERS = {
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
    { id: 'newest', label: 'Сначала новые', icon: 'arrow-down' },
    { id: 'oldest', label: 'Сначала старые', icon: 'arrow-up' },
  ],
  DATE: [
    { id: 'all', label: 'Все даты' },
    { id: 'today', label: 'Сегодня' },
    { id: 'tomorrow', label: 'Завтра' },
    { id: 'week', label: 'Эта неделя' },
  ]
};

const OrdersListScreen = ({ navigation }: any) => {
  const [activeTab, setActiveTab] = useState<'active' | 'archive' | 'trash'>('active');
  const [orders, setOrders] = useState<Order[]>(mapEngine.getOrders(true));
  const [searchQuery, setSearchBarQuery] = useState('');
  const [currentUser, setCurrentUser] = useState(mapEngine.getCurrentUser());
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    const unsubscribe = mapEngine.subscribe(() => {
      setOrders(mapEngine.getOrders(true));
    }, 'OrdersListScreen');
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Sync UI state on focus
      setOrders(mapEngine.getOrders(true));

      const user = mapEngine.getCurrentUser();
      if (user) setCurrentUser(user);
      else mapEngine.syncUser().then(setCurrentUser);

      // Only sync if we have no orders or if it's the first load in this focus cycle
      if (!mapEngine.entityStore.isMyOrdersLoaded) {
        mapEngine.syncMyOrders();
      }
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    await Promise.all([
      mapEngine.syncMyOrders(0, 20),
      mapEngine.syncUser(true)
    ]);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await mapEngine.syncMyOrders(orders.length, 20);
    if (result.length < 20) setHasMore(false);
    setLoadingMore(false);
  };

  const filteredOrders = useMemo(() => {
    const myId = currentUser?.uid || currentUser?.id;
    let result = orders.filter(order => {
      // 0. Trash Logic
      if (activeTab === 'trash') {
          if (order.status !== 'CANCELLED') return false;
      } else {
          if (order.status === 'CANCELLED') return false;
      }

      // 1. Search Query
      if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches = order.title.toLowerCase().includes(q) || order.address.toLowerCase().includes(q);
          if (!matches) return false;
      }

      const isMyOrder = order.employerId === myId;
      const amIExecutor = order.executorId === myId;

      // Applicant logic: hide if someone else was selected
      const someoneElseSelected = (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS' || order.status === 'COMPLETED') && !amIExecutor;
      const iApplied = order.applications?.some(a => (a.executorId === myId)) && !someoneElseSelected;

      // 1. Tab Logic: Archive = ONLY COMPLETED. Active = everything else mine.
      if (activeTab === 'archive') {
          if (order.status !== 'COMPLETED') return false;
          if (!isMyOrder && !amIExecutor) return false;
      } else {
          if (order.status === 'COMPLETED') return false;
          if (!isMyOrder && !amIExecutor && !iApplied) return false;
      }

      // 2. Filter logic
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (workTypeFilter !== 'all' && order.workType !== workTypeFilter) return false;

      // 3. Date Filter logic
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

  const handleDelete = (orderId: string) => {
    Alert.alert(
      'Удаление заказа',
      'Заказ будет перенесен в корзину и окончательно удален через 10 дней. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'В корзину',
          style: 'destructive',
          onPress: async () => {
            try {
              await mapEngine.updateOrder(orderId, { status: 'CANCELLED' });
            } catch (e) {
              Alert.alert('Ошибка', 'Не удалось удалить заказ');
            }
          }
        }
      ]
    );
  };

  const handleRestore = async (orderId: string) => {
      try {
          await mapEngine.updateOrder(orderId, { status: 'PUBLISHED' });
          Alert.alert('Успех', 'Заказ восстановлен');
      } catch (e) {
          Alert.alert('Ошибка', 'Не удалось восстановить заказ');
      }
  };

  const handleCall = (phone?: string) => {
      const tel = phone || '+79991234567'; // Placeholder for testing
      Linking.openURL(`tel:${tel}`);
  }

  const handleStartWork = async (orderId: string) => {
    try {
      await mapEngine.startOrder(orderId);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось начать работу');
    }
  };

  const handleCompleteWork = async (orderId: string) => {
    try {
      await mapEngine.completeOrder(orderId);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось завершить работу');
    }
  };

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

  const stats = React.useMemo(() => {
      // Show stats for Workers (Completed/Earned) and Employers (Placed/Active)
      if (currentUser?.role === 'WORKER') {
          const completed = orders.filter(o => o.status === 'COMPLETED').length;
          const earned = orders.filter(o => o.status === 'COMPLETED').reduce((sum, o) => sum + o.price, 0);
          return { label: 'Мастер', count: completed, sum: earned, countLabel: 'вып.' };
      } else {
          const placed = orders.filter(o => o.employerId === (currentUser?.uid || currentUser?.id)).length;
          const active = orders.filter(o => o.employerId === (currentUser?.uid || currentUser?.id) && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
          return { label: 'Заказчик', count: placed, sum: active, countLabel: 'всего', sumLabel: 'активных' };
      }
  }, [orders, currentUser]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={styles.headerTitle}>Мои заказы</Text>
            {stats && (
                <View style={styles.statsBadge}>
                    <Text style={styles.statsText}>
                        {stats.count} {stats.countLabel} • {stats.sum.toLocaleString()} {stats.sumLabel || '₽'}
                    </Text>
                </View>
            )}
        </View>

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
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trash' && styles.tabActive]}
            onPress={() => {
                setActiveTab('trash');
                setStatusFilter('all');
            }}
          >
            <Ionicons name="trash-outline" size={18} color={activeTab === 'trash' ? COLORS.primary : COLORS.gray} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={COLORS.gray} />
            <TextInput
                style={styles.searchInput}
                placeholder="Поиск по названию или адресу..."
                value={searchQuery}
                onChangeText={setSearchBarQuery}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchBarQuery('')}>
                    <Ionicons name="close-circle" size={18} color={COLORS.gray} />
                </TouchableOpacity>
            )}
        </View>
      </View>

      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          >
            <Ionicons
              name={FILTERS.SORT.find(s => s.id === sortOrder)?.icon as any}
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

      <FlatList
        data={filteredOrders}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} color={COLORS.primary} /> : null}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            isEmployer={item.employerId === (currentUser?.uid || currentUser?.id)}
            currentUserId={currentUser?.uid || currentUser?.id}
            hasApplied={item.applications?.some(a => a.executorId === (currentUser?.uid || currentUser?.id))}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            onDelete={() => handleDelete(item.id)}
            onEdit={() => navigation.navigate('EditOrder', { orderId: item.id })}
            onStart={() => handleStartWork(item.id)}
            onComplete={() => handleCompleteWork(item.id)}
            onChat={() => navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: item.id } })}
            onCall={() => handleCall()}
            onRestore={() => handleRestore(item.id)}
            onReview={() => navigation.navigate('OrderDetail', { orderId: item.id, showReview: true })}
            onCancelApplication={() => {
              Alert.alert('Отмена отклика', 'Вы уверены?', [
                { text: 'Нет' },
                { text: 'Да', onPress: () => mapEngine.cancelApplication(item.id) }
              ]);
            }}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="documents-outline" size={64} color={COLORS.border} />
            <Text style={styles.emptyText}>Заказов не найдено</Text>
            <Text style={styles.emptySubtext}>
                {activeTab === 'trash' ? 'В корзине пока пусто' : 'Попробуйте изменить фильтры или вкладку'}
            </Text>
            <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => activeTab === 'active' && currentUser?.role === 'WORKER' ? navigation.navigate('Map') : navigation.navigate('Add')}
            >
                <Text style={styles.emptyBtnText}>
                    {currentUser?.role === 'WORKER' ? 'Найти заказы на карте' : 'Создать новый заказ'}
                </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: COLORS.dark, letterSpacing: -1 },
  statsBadge: { backgroundColor: COLORS.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statsText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
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
    color: COLORS.primary,
  },
  filtersWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filtersScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: COLORS.dark,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24
  },
  emptyBtn: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 16,
      ...SHADOWS.medium
  },
  emptyBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 15
  }
});

export default OrdersListScreen;
