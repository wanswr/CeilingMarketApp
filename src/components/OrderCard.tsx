import AppIcon from './AppIcon';
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { Order, OrderStatus } from '../types'
import { COLORS, SHADOWS } from '../constants/theme'
import { formatDate } from '../utils/date'

interface OrderCardProps {
  order: Order;
  isEmployer: boolean;
  onPress: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onChat?: () => void;
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
    // case 'REVIEWED': // Deprecated
      return { label: 'Оставлен отзыв', color: '#059669', icon: 'star-outline' };
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

export const OrderCard: React.FC<OrderCardProps & { onCancelApplication?: () => void, hasApplied?: boolean, currentUserId?: string, submitting?: boolean }> = ({
  order,
  isEmployer,
  onPress,
  onDelete,
  onEdit,
  onStart,
  onComplete,
  onChat,
  onCancelApplication,
  hasApplied,
  currentUserId,
  submitting
}) => {
  const statusInfo = getStatusDetails(order.status);
  const amIExecutor = order.executorId === currentUserId;
  const myApplication = order.applications?.find(a => a.executorId === currentUserId);
  const hasUnviewedApplication = isEmployer && order.applications?.some(a => a.status === 'PENDING');

  const renderRightActions = (progress: any, dragX: any) => {
    if (isEmployer && (order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES')) {
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={onDelete}>
          <AppIcon name="action-delete" size={24} color="#fff" />
          <Text style={styles.actionText}>Удалить</Text>
        </TouchableOpacity>
      );
    }

    if (hasApplied && (order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES')) {
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={onCancelApplication}>
          <AppIcon name="nav-close" size={24} color="#fff" />
          <Text style={styles.actionText}>Отказать</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  const renderLeftActions = (progress: any, dragX: any) => {
    if (isEmployer && (order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES')) {
      return (
        <TouchableOpacity style={styles.editAction} onPress={onEdit}>
          <AppIcon name="action-edit" size={24} color="#fff" />
          <Text style={styles.actionText}>Правка</Text>
        </TouchableOpacity>
      );
    }

    if (!isEmployer && order.status === 'CLAIMED' && amIExecutor) {
      return (
        <TouchableOpacity style={styles.startAction} onPress={onStart} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <AppIcon name="status-active" size={24} color="#fff" />}
          <Text style={styles.actionText}>{submitting ? 'Запуск...' : 'Начать'}</Text>
        </TouchableOpacity>
      );
    }

    if (!isEmployer && order.status === 'IN_PROGRESS' && amIExecutor) {
      return (
        <TouchableOpacity style={styles.completeAction} onPress={onComplete} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <AppIcon name="status-done" size={24} color="#fff" />}
          <Text style={styles.actionText}>{submitting ? 'Завершение...' : 'Завершить'}</Text>
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
        style={[styles.card, hasUnviewedApplication && styles.cardUnread]}
        onPress={onPress}
      >
        <View style={styles.header}>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15' }]}>
            <AppIcon name={statusInfo.icon as any} size={14} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <View style={styles.priceContainer}>
              {myApplication && !amIExecutor && (
                  <Text style={styles.myPriceLabel}>Ваша цена: {myApplication.price || order.price} ₽</Text>
              )}
              <Text style={styles.price}>{order.price} ₽</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{order.title}</Text>
            {hasUnviewedApplication && <View style={styles.unreadDot} />}
        </View>

        <View style={styles.infoRow}>
          <AppIcon name="sys-location" size={16} color={COLORS.gray} />
          <Text style={styles.infoText} numberOfLines={1}>{order.address}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.metaInfo}>
            <View style={styles.metaItem}>
              <AppIcon name="sys-calendar" size={14} color={COLORS.gray} />
              <Text style={styles.metaText}>{formatDate(order.date)}</Text>
            </View>
            {hasApplied && !isEmployer && (
                <View style={[styles.metaItem, styles.appliedBadge]}>
                    <Text style={styles.appliedText}>
                        {myApplication?.status === 'VIEWED' ? 'Просмотрено' : 'Отклик отправлен'}
                    </Text>
                </View>
            )}
            {isEmployer && order.applications && order.applications.length > 0 && (
               <View style={styles.metaItem}>
                 <AppIcon name="sys-friends" size={14} color={COLORS.primary} />
                 <Text style={[styles.metaText, { color: COLORS.primary, fontWeight: '700' }]}>
                   {order.applications.length} откл.
                 </Text>
               </View>
            )}
          </View>

          {(isEmployer || amIExecutor || hasApplied) && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {((isEmployer && order.status === "COMPLETED") || (amIExecutor && (order.status === "COMPLETED" ))) &&
                 !(order.reviews || []).some(r => r.authorId?.toString().trim().toLowerCase() === currentUserId?.toString().trim().toLowerCase()) && (
                  <TouchableOpacity
                    style={[styles.chatButton, { backgroundColor: COLORS.warning + "20" }]}
                    onPress={onPress}
                  >
                    <AppIcon name="sys-rating" size={20} color={COLORS.warning} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.chatButton} onPress={onChat}>
                  <AppIcon name="action-chat" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
          )}
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
    borderColor: 'rgba(0,0,0,0.05)' },
  cardUnread: {
      borderColor: COLORS.primary + '30',
      backgroundColor: COLORS.primary + '05'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4 },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase' },
  priceContainer: {
      alignItems: 'flex-end'
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.dark },
  myPriceLabel: {
      fontSize: 11,
      color: COLORS.gray,
      marginBottom: 2
  },
  titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    flex: 1,
    letterSpacing: -0.5 },
  unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COLORS.primary,
      marginLeft: 8
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4 },
  infoText: {
    fontSize: 14,
    color: COLORS.gray,
    flex: 1 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
    paddingTop: 12 },
  metaInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    alignItems: 'center' },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4 },
  metaText: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '500' },
  appliedBadge: {
      backgroundColor: 'rgba(45, 91, 255, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6
  },
  appliedText: {
      fontSize: 10,
      color: COLORS.primary,
      fontWeight: '700'
  },
  chatButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center' },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '92%',
    borderRadius: 20,
    marginLeft: 10 },
  editAction: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10 },
  startAction: {
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10 },
  completeAction: {
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '92%',
    borderRadius: 20,
    marginRight: 10 },
  actionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4 }
});
