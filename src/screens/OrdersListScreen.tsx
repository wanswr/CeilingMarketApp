import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapEngine } from '../services/MapEngine';
import { Order, OrderStatus } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';
import { OrderCard } from '../components/OrderCard';

const FILTERS = {
  STATUS: [
    { id: 'all', label: 'Все' },
    { id: 'PUBLISHED', label: 'Ожидает откликов' },
    { id: 'HAS_RESPONSES', label: 'Есть отклики' },
    { id: 'IN_PROGRESS', label: 'В работе' },
    { id: 'COMPLETED', label: 'Выполнено' },
  ],
  WORK_TYPE: [
    { id: 'all', label: 'Все типы' },
    { id: 'Монтажные работы', label: 'Монтаж' },
    { id: 'Сервис', label: 'Сервис' },
    { id: 'Ремонт', label: 'Ремонт' },
    { id: 'Другое', label: 'Другое' },
  ],
  SORT: [
    { id: 'newest', label: 'Сначала новые', icon: 'arrow-down' },
    { id: 'oldest', label: 'Сначала старые', icon: 'arrow-up' },
  ]
};

const OrdersListScreen = ({ navigation }: any) => {
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [orders, setOrders] = useState<Order[]>(mapEngine.getOrders());
  const [currentUser, setCurrentUser] = useState(mapEngine.getCurrentUser());
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    const unsubscribe = mapEngine.subscribe((newOrders) => {
      setOrders(newOrders);
    });

    const user = mapEngine.getCurrentUser();
    if (user) setCurrentUser(user);
    else mapEngine.syncUser().then(setCurrentUser);

    return () => unsubscribe();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      mapEngine.forceRefresh(),
      mapEngine.syncUser(true)
    ]);
    setRefreshing(false);
  };

  const filteredOrders = useMemo(() => {
    let result = orders.filter(order => {
      const isMyOrder = order.employerId === currentUser?.uid;
      const amIExecutor = order.executorId === currentUser?.uid;
      const iApplied = order.applications?.some(a => a.executorId === currentUser?.uid);

      const isInTab = activeTab === 'active'
        ? order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (isMyOrder || amIExecutor || iApplied)
        : order.status === 'COMPLETED' && (isMyOrder || amIExecutor);

      if (!isInTab) return false;

      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (workTypeFilter !== 'all' && order.workType !== workTypeFilter) return false;

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
      'Вы уверены, что хотите удалить этот заказ?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Заказы</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.tabActive]}
            onPress={() => setActiveTab('active')}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Активные</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
            onPress={() => setActiveTab('archive')}
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
            <Ionicons
              name={FILTERS.SORT.find(s => s.id === sortOrder)?.icon as any}
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.sortButtonText}>
              {FILTERS.SORT.find(s => s.id === sortOrder)?.label}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {FILTERS.STATUS.map(f => renderFilterChip(f, statusFilter, setStatusFilter))}

          <View style={styles.divider} />

          {FILTERS.WORK_TYPE.map(f => renderFilterChip(f, workTypeFilter, setWorkTypeFilter))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredOrders}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            isEmployer={item.employerId === currentUser?.uid}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            onDelete={() => handleDelete(item.id)}
            onEdit={() => navigation.navigate('Add', { orderId: item.id })}
            onStart={() => handleStartWork(item.id)}
            onComplete={() => handleCompleteWork(item.id)}
            onChat={() => navigation.navigate('Chats', { orderId: item.id })}
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
            <Text style={styles.emptySubtext}>Попробуйте изменить фильтры или вкладку</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#fff' },
  headerTitle: { fontSize: 32, fontWeight: '900', color: COLORS.dark, marginBottom: 15 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 15
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  tabActive: {
    backgroundColor: '#fff',
    ...SHADOWS.soft
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700'
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
    height: 20,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  list: { padding: 16 },
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
  }
});

export default OrdersListScreen;
