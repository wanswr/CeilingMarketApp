import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Order, OrderStatus } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';
import { formatDate } from '../utils/date';

interface OrderCardProps {
  order: Order;
  isEmployer: boolean;
  onPress: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onChat?: () => void;
  onCall?: () => void;
  onRestore?: () => void;
}

const getStatusDetails = (status: OrderStatus) => {
  switch (status) {
    case 'PUBLISHED':
      return { label: 'Ожидает исполнителя', color: '#EF4444', icon: 'time-outline' };
    case 'HAS_RESPONSES':
      return { label: 'Есть отклики', color: '#F59E0B', icon: 'people-outline' };
    case 'CLAIMED':
      return { label: 'Исполнитель выбран', color: '#3B82F6', icon: 'checkmark-circle-outline' };
    case 'IN_PROGRESS':
      return { label: 'В работе', color: '#8B5CF6', icon: 'hammer-outline' };
    case 'COMPLETED':
      return { label: 'Выполнено', color: '#10B981', icon: 'ribbon-outline' };
    case 'CANCELLED':
      return { label: 'Отменен', color: COLORS.gray, icon: 'close-circle-outline' };
    default:
      return { label: status, color: COLORS.gray, icon: 'help-circle-outline' };
  }
};

const getWorkTypeLabel = (type: string) => {
    switch (type) {
        case 'FROZE': return 'Замер';
        case 'INSTALLATION': return 'Монтаж';
        case 'SERVICE': return 'Сервис';
        case 'REPAIR': return 'Ремонт';
        case 'OTHER': return 'Другое';
        default: return type;
    }
}

export const OrderCard: React.FC<OrderCardProps & { onCancelApplication?: () => void, hasApplied?: boolean, currentUserId?: string }> = ({
  order,
  isEmployer,
  onPress,
  onDelete,
  onEdit,
  onStart,
  onComplete,
  onChat,
  onCall,
  onRestore,
  onCancelApplication,
  hasApplied,
  currentUserId
}) => {
  const statusInfo = getStatusDetails(order.status);
  const amIExecutor = order.executorId === currentUserId;
  const isDeleted = order.status === 'CANCELLED';

  const myApplication = order.applications?.find(a => a.executorId === currentUserId);

  const isToday = React.useMemo(() => {
    const d = new Date(order.date);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }, [order.date]);

  const isTomorrow = React.useMemo(() => {
    const d = new Date(order.date);
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return d.getDate() === tom.getDate() && d.getMonth() === tom.getMonth() && d.getFullYear() === tom.getFullYear();
  }, [order.date]);

  const renderRightActions = (progress: any, dragX: any) => {
    if (isDeleted) {
        return (
            <TouchableOpacity style={styles.restoreAction} onPress={onRestore}>
              <Ionicons name="refresh-outline" size={24} color="#fff" />
              <Text style={styles.actionText}>Восстановить</Text>
            </TouchableOpacity>
        );
    }
    if (isEmployer) {
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={onDelete}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Удалить</Text>
        </TouchableOpacity>
      );
    }

    if (hasApplied && order.status === 'HAS_RESPONSES') {
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={onCancelApplication}>
          <Ionicons name="close-circle-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Отказаться</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  const renderLeftActions = (progress: any, dragX: any) => {
    if (isEmployer) {
      return (
        <TouchableOpacity style={styles.editAction} onPress={onEdit}>
          <Ionicons name="create-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Редактировать</Text>
        </TouchableOpacity>
      );
    }

    if (!isEmployer && order.status === 'CLAIMED' && amIExecutor) {
      return (
        <TouchableOpacity style={styles.startAction} onPress={onStart}>
          <Ionicons name="play-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Приступить</Text>
        </TouchableOpacity>
      );
    }

    if (!isEmployer && order.status === 'IN_PROGRESS' && amIExecutor) {
      return (
        <TouchableOpacity style={styles.completeAction} onPress={onComplete}>
          <Ionicons name="checkmark-done-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Закончить</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={onPress}
      >
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15' }]}>
                <Ionicons name={statusInfo.icon as any} size={14} color={statusInfo.color} />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
            {(isToday || isTomorrow) && !isDeleted && (
                <View style={[styles.urgencyBadge, isToday ? styles.todayBadge : styles.tomorrowBadge]}>
                    <View style={[styles.pulseDot, isToday ? { backgroundColor: '#EF4444' } : { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.urgencyText}>{isToday ? 'Сегодня' : 'Завтра'}</Text>
                </View>
            )}
          </View>
          <Text style={styles.price}>{order.price} ₽</Text>
        </View>

        <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{order.title}</Text>
            {!isEmployer && myApplication && !isDeleted && (
                <View style={[
                    styles.myBidBadge,
                    myApplication.status === 'ACCEPTED' && { backgroundColor: '#10B98120', borderColor: '#10B981' },
                    myApplication.status === 'REJECTED' && { backgroundColor: '#EF444420', borderColor: '#EF4444' }
                ]}>
                    <Text style={[
                        styles.myBidText,
                        myApplication.status === 'ACCEPTED' && { color: '#10B981' },
                        myApplication.status === 'REJECTED' && { color: '#EF4444' }
                    ]}>
                        {myApplication.status === 'ACCEPTED' ? 'Вы одобрены' :
                         myApplication.status === 'REJECTED' ? 'Отклонено' : 'Ваш отклик'}
                    </Text>
                </View>
            )}
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.gray} />
          <Text style={styles.infoText} numberOfLines={1}>{order.address}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.metaInfo}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.gray} />
              <Text style={styles.metaText}>{formatDate(order.date)}</Text>
            </View>
            {order.workType && (
              <View style={styles.metaItem}>
                <Ionicons name="construct-outline" size={14} color={COLORS.gray} />
                <Text style={styles.metaText}>{getWorkTypeLabel(order.workType)}</Text>
              </View>
            )}
            {isEmployer && order.applications && order.applications.length > 0 && (
               <View style={styles.metaItem}>
                 <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                 <Text style={[styles.metaText, { color: COLORS.primary, fontWeight: '700' }]}>
                   {order.applications.length} откликов
                 </Text>
               </View>
            )}
          </View>

          <View style={styles.actionButtons}>
            {(amIExecutor || isEmployer) && (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS') && (
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#10B98115' }]} onPress={onCall}>
                    <Ionicons name="call-outline" size={20} color="#10B981" />
                </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconButton} onPress={onChat}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.dark,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.gray,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
    paddingTop: 12,
  },
  metaInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  todayBadge: { backgroundColor: '#EF444410' },
  tomorrowBadge: { backgroundColor: '#F59E0B10' },
  urgencyText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  myBidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10'
  },
  myBidText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  restoreAction: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginLeft: 10,
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '92%',
    borderRadius: 20,
    marginLeft: 10,
  },
  editAction: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10,
  },
  startAction: {
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10,
  },
  completeAction: {
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10,
  },
  actionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  }
});
