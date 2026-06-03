import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeListView } from 'react-native-swipe-list-view';
import { COLORS } from '../constants/theme';
import { orderService, Order } from '../services/OrderService';
import { formatDate } from '../utils/date';

const OrdersListScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [candidateModalVisible, setCandidateModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    const updateOrders = (newOrders: Order[]) => {
      // Sort: pinned first, then by timestamp desc
      const sorted = [...newOrders].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      setOrders(sorted);
    };

    updateOrders(orderService.getOrders());
    orderService.on('ordersUpdated', updateOrders);
    return () => { orderService.off('ordersUpdated', updateOrders); };
  }, []);

  const openMap = (address: string) => {
    const url = Platform.select({ ios: `maps:0,0?q=${address}`, android: `geo:0,0?q=${address}` });
    if (url) Linking.openURL(url);
  };

  const handleAction = (order: Order, action: 'accept' | 'delete' | 'pin') => {
    if (action === 'delete') {
      Alert.alert(
        "Удаление",
        "Вы уверены, что хотите полностью удалить этот заказ?",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Удалить",
            style: "destructive",
            onPress: () => orderService.deleteOrder(order.id)
          }
        ]
      );
    } else if (action === 'pin') {
      orderService.togglePin(order.id, !!order.isPinned);
    } else {
      if (order.candidates && order.candidates.length > 0) {
        setSelectedOrder(order);
        setCandidateModalVisible(true);
      } else {
        Alert.alert("Отклики", "Пока никто не откликнулся на этот заказ.");
      }
    }
  };

  const confirmWorker = async (worker: any) => {
    if (selectedOrder) {
      try {
        await orderService.confirmWorker(selectedOrder.id, worker);
        setCandidateModalVisible(false);
        setSelectedOrder(null);
        Alert.alert("Успех", "Исполнитель назначен!");
      } catch (e) {
        Alert.alert("Ошибка", "Не удалось назначить исполнителя.");
      }
    }
  };

  return (
    <View style={styles.container}>
      <SwipeListView
        data={orders}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            style={styles.rowFront}
          >
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {item.isPinned && <Ionicons name="pin" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />}
                <Text style={styles.dateText}>
                  {formatDate(item.date || item.timestamp)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'started' || item.status === 'in_work' ? COLORS.warning : COLORS.primary }]}>
                <Text style={styles.statusText}>{item.status === 'started' || item.status === 'in_work' ? 'В работе' : 'Ожидание'}</Text>
              </View>
            </View>
            <Text style={styles.titleText}>{item.title || 'Заказ без названия'}</Text>
            <Text style={styles.addressText}>{item.address}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.priceText}>{item.price} ₽</Text>
              <View style={styles.iconGroup}>
                <TouchableOpacity onPress={() => openMap(item.address)} style={styles.iconBtn}><Ionicons name="navigate-circle-outline" size={28} color={COLORS.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Chats')} style={styles.iconBtn}><Ionicons name="chatbubbles-outline" size={26} color={COLORS.secondary} /></TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
        renderHiddenItem={({ item }) => (
          <View style={styles.rowBack}>
            <View style={styles.backLeftContainer}>
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: COLORS.success }]}
                onPress={() => handleAction(item, 'accept')}
              >
                <Ionicons name="people" size={24} color="#fff" />
                <Text style={styles.backTextWhite}>Принять</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => handleAction(item, 'pin')}
              >
                <Ionicons name="pin" size={24} color={item.isPinned ? COLORS.success : "#fff"} />
                <Text style={styles.backTextWhite}>{item.isPinned ? "Открепить" : "Закрепить"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.backRightBtn]}
              onPress={() => handleAction(item, 'delete')}
            >
              <Ionicons name="trash" size={24} color="#fff" />
              <Text style={styles.backTextWhite}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
        leftOpenValue={160}
        rightOpenValue={-80}
        stopLeftSwipe={180}
        stopRightSwipe={-100}
      />

      <Modal visible={candidateModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Выберите исполнителя</Text>
              <TouchableOpacity onPress={() => setCandidateModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.dark} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {selectedOrder?.candidates?.map((c, i) => (
                <TouchableOpacity key={i} style={styles.candidateItem} onPress={() => confirmWorker(c)}>
                  <View style={styles.candidateInfo}>
                    <Ionicons name="person-circle" size={40} color={COLORS.gray} />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.candidateName}>{c.name || `Мастер #${i + 1}`}</Text>
                      <Text style={styles.candidateRating}>⭐ 5.0 • 12 заказов</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.border} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  rowFront: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 15,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { color: COLORS.gray, fontSize: 13, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  titleText: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginTop: 12 },
  addressText: { fontSize: 15, fontWeight: '500', color: COLORS.gray, marginBottom: 12, marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  priceText: { fontSize: 20, color: COLORS.success, fontWeight: '800' },
  iconGroup: { flexDirection: 'row' },
  iconBtn: { marginLeft: 15 },
  rowBack: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 15,
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 20,
  },
  backLeftContainer: {
    flexDirection: 'row',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 160,
  },
  backBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backRightBtn: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 80,
    backgroundColor: COLORS.danger,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    right: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.dark,
  },
  candidateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  candidateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  candidateRating: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  backTextWhite: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
});

export default OrdersListScreen;