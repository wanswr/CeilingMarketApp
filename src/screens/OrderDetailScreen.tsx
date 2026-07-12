import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, Image, Modal, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { Order } from '../types'
import { mapEngine } from '../services/MapEngine'
import { Button } from '../components/Button'
import { COLORS, SHADOWS } from '../constants/theme'
import { formatDate } from '../utils/date'

const OrderDetailScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | undefined>(mapEngine.getOrder(orderId));
  const REVIEW_KEY_PREFIX = 'order_reviewed_';
  const [hasReviewed, setHasReviewed] = useState(() => {
    const { storageService } = require('../services/StorageService');
    return !!storageService.get(`${REVIEW_KEY_PREFIX}${orderId}`);
  });
  const [loading, setLoading] = useState(!order);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(mapEngine.getCurrentUser());
  const [showApplications, setShowApplications] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [offerPrice, setOfferPrice] = useState('');

  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;

    mapEngine.syncUser().then(setCurrentUser);
    const unsubscribe = mapEngine.subscribe(() => {
      const updated = mapEngine.getOrder(orderId);
      if (updated) {
        setOrder(updated);
        setLoading(false);
      }
    }, `OrderDetailScreen_${orderId}`);

    isSubscribedRef.current = true;

    if (!order) {
        mapEngine.syncOrder(orderId).catch(() => {
            Alert.alert('Ошибка', 'Не удалось загрузить данные заказа');
            navigation.goBack();
        });
    }

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [orderId]);

  const handleCancelApplication = async () => {
    if (submitting) return;
    Alert.alert(
      'Отмена отклика',
      'Вы уверены, что хотите отозвать свой отклик?',
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отозвать',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await mapEngine.cancelApplication(orderId);
              Alert.alert('Успех', 'Отклик отозван');
            } catch (error: any) {
              Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отозвать отклик (возможно, до начала осталось менее 24 часов)');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const handleApply = async () => {
    if (submitting || hasApplied) return;
    setOfferPrice(order?.price.toString() || '');
    setShowPriceModal(true);
  };

  const submitOffer = async () => {
    if (submitting) return;
    const numericPrice = offerPrice ? parseFloat(offerPrice.replace(/\s/g, '')) : undefined;
    if (offerPrice !== '' && isNaN(numericPrice as number)) {
        Alert.alert('Ошибка', 'Введите корректное число');
        return;
    }

    setShowPriceModal(false);
    setSubmitting(true);
    try {
        await mapEngine.applyForOrder(orderId, numericPrice);
        Alert.alert('Успех', 'Вы успешно откликнулись на заказ');
    } catch (error: any) {
        Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отправить отклик');
    } finally {
        setSubmitting(false);
    }
  };

  const handleAcceptApplication = async (applicationId: string) => {
    if (submitting) return;
    Alert.alert(
      'Выбор исполнителя',
      'Вы уверены, что хотите выбрать этого исполнителя? Остальные отклики будут отклонены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подтвердить',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await mapEngine.acceptApplication(applicationId);
              setShowApplications(false);
              Alert.alert('Успех', 'Исполнитель выбран');
            } catch (e) {
              Alert.alert('Ошибка', 'Не удалось выбрать исполнителя');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const handleStartWork = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await mapEngine.startOrder(orderId);
      Alert.alert('Успех', 'Статус заказа изменен на "В работе"');
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось начать работу');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteWork = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await mapEngine.completeOrder(orderId);
      Alert.alert('Успех', 'Заказ выполнен!', [
          { text: 'Оставить отзыв', onPress: () => setShowReviewModal(true) },
          { text: 'Позже' }
      ]);
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось завершить работу');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async () => {
      setSubmitting(true);
      try {
          // @ts-ignore
          await apiService.api.post(`/users/${isEmployer ? order?.executorId : order?.employerId}/reviews`, {
              rating,
              text: reviewText,
              orderId
          });
          const { storageService } = require('../services/StorageService');
          storageService.set(`${REVIEW_KEY_PREFIX}${orderId}`, true);
          setHasReviewed(true);
          Alert.alert('Спасибо!', 'Ваш отзыв важен для нас');
          setShowReviewModal(false);
      } catch (e) {
          Alert.alert('Ошибка', 'Не удалось отправить отзыв');
      } finally {
          setSubmitting(false);
      }
  }

  const myId = currentUser?.uid || currentUser?.id;
  const isEmployer = myId === order?.employerId;
  const isExecutor = myId === order?.executorId;
  const hasApplied = order?.applications?.some(a => a.executorId === myId);

  if (loading || !order) {
    return (
      <View style={styles.container}>
        <View style={[styles.imageHeader, { backgroundColor: '#f0f0f0' }]} />
        <View style={styles.contentCard}>
          <View style={{ width: 120, height: 40, borderRadius: 16, backgroundColor: '#f0f0f0', marginBottom: 20 }} />
          <View style={{ width: '80%', height: 34, borderRadius: 8, backgroundColor: '#f0f0f0', marginBottom: 24 }} />
          <View style={{ gap: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#f0f0f0' }} />
              <View style={{ marginLeft: 16, gap: 4 }}>
                <View style={{ width: 60, height: 12, backgroundColor: '#f0f0f0' }} />
                <View style={{ width: 200, height: 16, backgroundColor: '#f0f0f0' }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#f0f0f0' }} />
              <View style={{ marginLeft: 16, gap: 4 }}>
                <View style={{ width: 80, height: 12, backgroundColor: '#f0f0f0' }} />
                <View style={{ width: 150, height: 16, backgroundColor: '#f0f0f0' }} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageHeader}>
          {order.images && order.images.length > 0 ? (
            <Image source={{ uri: order.images[0] }} style={styles.mainImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
               <Ionicons name="image-outline" size={64} color={COLORS.border} />
               <Text style={{ color: COLORS.placeholder, marginTop: 10, fontWeight: '600' }}>Фото не добавлено</Text>
            </View>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
             <BlurView intensity={80} tint="light" style={styles.backBtnBlur}>
                <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
             </BlurView>
          </TouchableOpacity>
        </View>

        <View style={styles.contentCard}>
          <View style={styles.priceRow}>
            <View style={styles.priceBadge}>
               <Text style={styles.priceText}>{order.price} ₽</Text>
            </View>
            <View style={[
                styles.statusBadge,
                order.status === 'PUBLISHED' && { backgroundColor: 'rgba(45, 91, 255, 0.1)' },
                order.status === 'HAS_RESPONSES' && { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
                order.status === 'CLAIMED' && { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
                order.status === 'IN_PROGRESS' && { backgroundColor: 'rgba(139, 92, 246, 0.1)' },
                order.status === 'COMPLETED' && { backgroundColor: 'rgba(16, 185, 129, 0.1)' }
            ]}>
               <Text style={[
                   styles.statusText,
                   order.status === 'PUBLISHED' && { color: COLORS.primary },
                   order.status === 'HAS_RESPONSES' && { color: '#F59E0B' },
                   order.status === 'CLAIMED' && { color: '#3B82F6' },
                   order.status === 'IN_PROGRESS' && { color: '#8B5CF6' },
                   order.status === 'COMPLETED' && { color: '#10B981' }
               ]}>
                   {order.status === 'PUBLISHED' ? 'Ожидает исполнителя' :
                    order.status === 'HAS_RESPONSES' ? 'Есть отклики' :
                    order.status === 'CLAIMED' ? 'Исполнитель выбран' :
                    order.status === 'IN_PROGRESS' ? 'В работе' :
                    order.status === 'COMPLETED' ? 'Выполнено' :
                    order.status === 'CANCELLED' ? 'Отменен' : order.status}
               </Text>
            </View>
          </View>

          <Text style={styles.title}>{order.title}</Text>

          <View style={styles.infoGrid}>
            {order.workType && (
              <View style={styles.infoItem}>
                 <View style={styles.iconContainer}>
                   <Ionicons name="construct" size={22} color={COLORS.primary} />
                 </View>
                 <View style={styles.infoTextWrapper}>
                   <Text style={styles.infoLabel}>Тип работы</Text>
                   <Text style={styles.infoValue}>
                     {order.workType === 'FROZE' ? 'Замер' :
                      order.workType === 'INSTALLATION' ? 'Монтаж' :
                      order.workType === 'SERVICE' ? 'Сервис' :
                      order.workType === 'REPAIR' ? 'Ремонт' :
                      order.workType === 'OTHER' ? 'Другое' : order.workType}
                   </Text>
                 </View>
              </View>
            )}

            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <Ionicons name="location" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Адрес</Text>
                 <Text style={styles.infoValue}>{order.address}</Text>
               </View>
            </View>

            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <Ionicons name="calendar" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Дата публикации</Text>
                 <Text style={styles.infoValue}>{formatDate(order.date)}</Text>
               </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Описание задачи</Text>
          <Text style={styles.description}>{order.details || 'Описание отсутствует'}</Text>

          <View style={styles.divider} />

          {isEmployer && order.applications && order.applications.length > 0 && (
            <TouchableOpacity
              style={styles.applicationsBanner}
              onPress={() => setShowApplications(true)}
            >
              <View style={styles.applicationsBannerContent}>
                <Ionicons name="people" size={24} color={COLORS.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.bannerTitle}>{order.applications.length} откликов</Text>
                  <Text style={styles.bannerSubtitle}>Нажмите, чтобы выбрать исполнителя</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Заказчик</Text>
          <TouchableOpacity style={styles.employerCard} activeOpacity={0.7}>
            <View style={styles.avatar}>
               <Text style={styles.avatarText}>{(order.employer?.name || 'U')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
               <Text style={styles.employerName}>{order.employer?.name || 'Заказчик'}</Text>
               <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={COLORS.warning} />
                  <Text style={styles.ratingText}>{order.employer?.rating?.toFixed(1) || '5.0'}</Text>
                  <Text style={styles.ordersCount}>• {order.employer?.completedOrders || 0} завершено</Text>
               </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.placeholder} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BlurView intensity={90} tint="light" style={styles.footer}>
        <SafeAreaView edges={['bottom']} style={{ flexDirection: 'row', gap: 12 }}>
          {isEmployer ? (
            <>
              <TouchableOpacity
                style={styles.chatButtonFooter}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: order.id } })}
              >
                <Ionicons name="chatbubbles-outline" size={24} color={COLORS.primary} />
                <Text style={styles.chatButtonTextFooter}>Сообщения</Text>
              </TouchableOpacity>

              {order.status === 'COMPLETED' && (
                hasReviewed ? (
                  <View style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.gray, opacity: 0.7 }]}>
                    <Text style={styles.applyBtnText}>Отзыв оставлен</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.warning }]}
                    onPress={() => setShowReviewModal(true)}
                  >
                    <Text style={styles.applyBtnText}>Оставить отзыв</Text>
                  </TouchableOpacity>
                )
              )}
            </>
          ) : isExecutor ? (
            <>
              <TouchableOpacity
                style={styles.iconChatBtn}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: order.id } })}
              >
                <Ionicons name="chatbubbles-outline" size={24} color={COLORS.primary} />
              </TouchableOpacity>

              {order.status === 'CLAIMED' && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.applyBtn, { flex: 1, backgroundColor: '#8B5CF6' }]}
                  onPress={handleStartWork}
                  disabled={submitting}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.applyBtnText}>Начать работу</Text>}
                </TouchableOpacity>
              )}

              {order.status === 'IN_PROGRESS' && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.applyBtn, { flex: 1, backgroundColor: '#10B981' }]}
                  onPress={handleCompleteWork}
                  disabled={submitting}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.applyBtnText}>Завершить работу</Text>}
                </TouchableOpacity>
              )}

              {order.status === 'COMPLETED' && (
                hasReviewed ? (
                  <View style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.gray, opacity: 0.7 }]}>
                    <Text style={styles.applyBtnText}>Отзыв оставлен</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.warning }]}
                    onPress={() => setShowReviewModal(true)}
                  >
                    <Text style={styles.applyBtnText}>Оставить отзыв</Text>
                  </TouchableOpacity>
                )
              )}
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.applyBtn,
                hasApplied && { backgroundColor: '#FF4757' },
                order.status === 'CLAIMED' && !hasApplied && { backgroundColor: COLORS.gray }
              ]}
              onPress={hasApplied ? handleCancelApplication : handleApply}
              disabled={submitting || (order.status === 'CLAIMED' && !hasApplied)}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.applyBtnText}>
                  {hasApplied ? 'Отказаться' : order.status === 'CLAIMED' ? 'Заказ занят' : 'Откликнуться'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </BlurView>

      <Modal
        visible={showPriceModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPriceModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
            <BlurView intensity={30} style={StyleSheet.absoluteFill}>
                <TouchableOpacity style={{flex: 1}} onPress={() => setShowPriceModal(false)} />
            </BlurView>
            <View style={styles.priceModalContent}>
                <Text style={styles.modalTitleSmall}>Ваше предложение</Text>
                <Text style={styles.modalSubtitleSmall}>Укажите цену, за которую готовы выполнить работу (₽)</Text>
                <TextInput
                    style={styles.priceInput}
                    value={offerPrice}
                    onChangeText={setOfferPrice}
                    keyboardType="numeric"
                    placeholder="Введите цену"
                    autoFocus
                />
                <View style={styles.modalActionsRow}>
                    <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowPriceModal(false)}>
                        <Text style={styles.modalCancelBtnText}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalApplyBtn} onPress={submitOffer}>
                        <Text style={styles.modalApplyBtnText}>Откликнуться</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      <Modal
        visible={showReviewModal}
        transparent
        animationType="slide"
      >
          <View style={styles.modalOverlayCenter}>
              <BlurView intensity={30} style={StyleSheet.absoluteFill}>
                  <TouchableOpacity style={{flex: 1}} onPress={() => setShowReviewModal(false)} />
              </BlurView>
              <View style={styles.priceModalContent}>
                  <Text style={styles.modalTitleSmall}>Оцените работу</Text>
                  <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map(s => (
                          <TouchableOpacity key={s} onPress={() => setRating(s)}>
                              <Ionicons name={s <= rating ? "star" : "star-outline"} size={32} color={COLORS.warning} />
                          </TouchableOpacity>
                      ))}
                  </View>
                  <TextInput
                      style={[styles.priceInput, { height: 100, textAlignVertical: 'top' }]}
                      placeholder="Напишите пару слов о мастере..."
                      multiline
                      value={reviewText}
                      onChangeText={setReviewText}
                  />
                  <TouchableOpacity style={styles.modalApplyBtn} onPress={submitReview} disabled={submitting}>
                      {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalApplyBtnText}>Отправить отзыв</Text>}
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal
        visible={showApplications}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowApplications(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={100} tint="light" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Отклики</Text>
              <TouchableOpacity onPress={() => setShowApplications(false)}>
                <Ionicons name="close-circle" size={32} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.applicationsList}>
              {order.applications?.map((app) => (
                <View key={app.id} style={styles.applicationCard}>
                  <View style={styles.appHeader}>
                    <View style={styles.avatarSmall}>
                       <Text style={styles.avatarTextSmall}>{app.executor?.name?.[0] || '?'}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.executorName}>{app.executor?.name || 'Мастер'}</Text>
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={14} color={COLORS.warning} />
                        <Text style={styles.ratingText}>{app.executor?.rating?.toFixed(1) || '5.0'}</Text>
                        <Text style={styles.ordersCount}>• {app.executor?.completedOrders || 0} заказов</Text>
                      </View>
                    </View>
                    <Text style={styles.offerPrice}>{app.price || order.price} ₽</Text>
                  </View>

                  <View style={styles.appActions}>
                     <TouchableOpacity
                      style={styles.appChatBtn}
                      onPress={() => {
                        setShowApplications(false);
                        navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: order.id, executorId: app.executorId } });
                      }}
                     >
                       <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                       <Text style={styles.appChatText}>Чат</Text>
                     </TouchableOpacity>

                     {(order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES') && (
                       <TouchableOpacity
                        style={styles.selectBtn}
                        onPress={() => handleAcceptApplication(app.id)}
                        disabled={submitting}
                       >
                         <Text style={styles.selectBtnText}>Выбрать</Text>
                       </TouchableOpacity>
                     )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  imageHeader: { height: 260, width: '100%', position: 'relative' },
  mainImage: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 10 },
  backBtnBlur: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  contentCard: {
    marginTop: -30,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    minHeight: 500
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  priceBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, ...SHADOWS.soft },
  priceText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  statusBadge: { backgroundColor: 'rgba(255, 71, 87, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusText: { color: COLORS.danger, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.dark, marginBottom: 24, lineHeight: 34, letterSpacing: -1 },
  infoGrid: { gap: 24 },
  infoItem: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', ...SHADOWS.soft },
  infoTextWrapper: { marginLeft: 16, flex: 1 },
  infoLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: COLORS.dark, fontWeight: '700', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 30 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginBottom: 16, letterSpacing: -0.5 },
  description: { fontSize: 16, color: COLORS.gray, lineHeight: 28, fontWeight: '500' },
  employerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 24,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)'
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  employerName: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingText: { fontSize: 14, fontWeight: '700', color: COLORS.dark, marginLeft: 4 },
  ordersCount: { fontSize: 14, color: COLORS.gray, marginLeft: 8, fontWeight: '500' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  applyBtn: {
    backgroundColor: COLORS.primary,
    height: 64,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3
  },
  applyBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  chatButtonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 64,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '10',
    gap: 8,
    flex: 1 },
  chatButtonTextFooter: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700' },
  iconChatBtn: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center' },
  applicationsBanner: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    padding: 16,
    marginBottom: 24 },
  applicationsBannerContent: {
    flexDirection: 'row',
    alignItems: 'center' },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark },
  bannerSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)' },
  modalOverlayCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '80%',
    padding: 24 },
  priceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    ...SHADOWS.heavy },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24 },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.dark },
  modalTitleSmall: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 8 },
  modalSubtitleSmall: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 20 },
  priceInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 20 },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center' },
  modalCancelBtnText: {
    color: COLORS.gray,
    fontWeight: '700' },
  modalApplyBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    ...SHADOWS.soft },
  modalApplyBtnText: {
    color: '#fff',
    fontWeight: '800' },
  applicationsList: {
    gap: 16,
    paddingBottom: 40 },
  applicationCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0' },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center' },
  avatarSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center' },
  avatarTextSmall: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800' },
  executorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark },
  offerPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primary },
  appActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12 },
  appChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    gap: 6 },
  appChatText: {
    color: COLORS.primary,
    fontWeight: '700' },
  selectBtn: {
    flex: 2,
    height: 44,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.soft },
  selectBtnText: {
    color: '#fff',
    fontWeight: '700' },
  starsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 20 }
});

export default OrderDetailScreen;
