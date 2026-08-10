import AppIcon from '../components/AppIcon';
import React, { useState, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, Image, Modal, TextInput, FlatList, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { Order } from '../types'
import { mapEngine } from '../services/MapEngine'
import { Button } from '../components/Button'
import { COLORS, SHADOWS } from '../constants/theme'
import { formatDate } from '../utils/date'
import { apiService } from '../services/ApiService'
import { usePendingAction } from '../context/PendingActionContext'
import { logger } from '../services/logger/LoggerService'

const activeApplications = new Set();
const activeReviews = new Set();

const OrderDetailScreen = ({ route, navigation }: any) => {
  const { requireRoleAndCategory } = usePendingAction();
  const applyIdempotencyKeyRef = useRef(Crypto.randomUUID());
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | undefined>(mapEngine.getOrder(orderId));
  const [loading, setLoading] = useState(!order);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(mapEngine.getCurrentUser());
  const [showApplications, setShowApplications] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [offerPrice, setOfferPrice] = useState('');

  const isSubscribedRef = useRef(false);

  const fetchOrderDetails = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
        // V11: Bypass cache to ensure UI is always fresh when entering Detail screen
        const updated = await mapEngine.syncOrder(orderId, true);
        if (updated) {
            setOrder(updated);
        }
        setLoading(false);
    } catch (e) {
        if (!isRefresh) {
            Alert.alert('Ошибка', 'Не удалось загрузить данные заказа');
            navigation.goBack();
        }
    } finally {
        if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isSubscribedRef.current) return;
    logger.info('SCREEN_OPEN: OrderDetail', { orderId });

    mapEngine.syncUser().then(setCurrentUser);
    const unsubscribe = mapEngine.subscribe(() => {
      const updated = mapEngine.getOrder(orderId);
      if (updated) {
        setOrder(updated);
        setLoading(false);
      }
    }, `OrderDetailScreen_${orderId}`);

    isSubscribedRef.current = true;

    fetchOrderDetails();

    return () => {
      logger.info('SCREEN_CLOSE: OrderDetail', { orderId });
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [orderId]);

  const handleCancelApplication = async () => {
    if (submitting) return;
    logger.logClick('CancelApplication', 'OrderDetail', { orderId });
    Alert.alert(
      'Отмена отклика',
      'Вы уверены, что хотите отозвать свой отклик?',
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отозвать',
          onPress: async () => {
            if (submitting) return;
            const aid = logger.startAction('CANCEL_APPLICATION', { orderId });
            setSubmitting(true);
            try {
              await mapEngine.cancelApplication(orderId);
              logger.endAction('CANCEL_APPLICATION', { aid });
              Alert.alert('Успех', 'Отклик отозван');
            } catch (error: any) {
              logger.logNetworkError(aid, error, { orderId });
              Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отозвать отклик');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const handleApply = async () => {
    logger.logClick('ApplyButton', 'OrderDetail', { orderId });
    if (submitting || hasApplied) return;
    setOfferPrice(order?.price.toString() || '');
    setShowPriceModal(true);
  };

  const submitOffer = async () => {
    if (submitting) return;
    if (activeApplications.has(orderId)) return;
    const numericPrice = offerPrice ? parseFloat(offerPrice.replace(/\s/g, '')) : undefined;
    if (offerPrice !== '' && isNaN(numericPrice as number)) {
        Alert.alert('Ошибка', 'Введите корректное число');
        return;
    }

    setShowPriceModal(false);

    requireRoleAndCategory(async () => {
      if (activeApplications.has(orderId)) return;
      activeApplications.add(orderId);
      const aid = logger.startAction('SUBMIT_APPLICATION', { orderId, price: numericPrice });
      setSubmitting(true);
      try {
          const res = await mapEngine.applyForOrder(orderId, numericPrice, applyIdempotencyKeyRef.current);
          if (res?.order) setOrder(res.order);

          logger.endAction('SUBMIT_APPLICATION', { aid });
          Alert.alert('Успех', 'Вы успешно откликнулись на заказ');
      } catch (error: any) {
          logger.logNetworkError(aid, error, { orderId });
          Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отправить отклик');
      } finally {
          setSubmitting(false);
          activeApplications.delete(orderId);
      }
    });
  };

  const handleAcceptApplication = async (applicationId: string) => {
    if (submitting) return;
    logger.logClick('AcceptApplication', 'OrderDetail', { orderId, applicationId });

    const appExists = order?.applications?.some(a => a.id === applicationId);
    if (!appExists) {
        Alert.alert('Внимание', 'Этот отклик был отозван исполнителем.');
        setShowApplications(false);
        mapEngine.syncOrder(orderId, true).then(updated => {
            if (updated) setOrder(updated);
        });
        return;
    }

    Alert.alert(
      'Выбор исполнителя',
      'Вы уверены, что хотите выбрать этого исполнителя? Остальные отклики будут отклонены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подтвердить',
          onPress: async () => {
            if (submitting) return;
            const currentOrder = mapEngine.getOrder(orderId);
            const stillExists = currentOrder?.applications?.some(a => a.id === applicationId);
            if (!stillExists) {
                Alert.alert('Внимание', 'Этот отклик был отозван исполнителем.');
                setShowApplications(false);
                mapEngine.syncOrder(orderId, true).then(updated => {
                    if (updated) setOrder(updated);
                });
                return;
            }

            const aid = logger.startAction('ACCEPT_APPLICATION', { orderId, applicationId });
            setSubmitting(true);
            try {
              const res = await mapEngine.acceptApplication(applicationId);
              if (res.data?.order) setOrder(res.data.order);

              logger.endAction('ACCEPT_APPLICATION', { aid });
              setShowApplications(false);
              Alert.alert('Успех', 'Исполнитель выбран. Чат создан.', [
                  { text: 'В чат', onPress: () => navigation.navigate('ChatDetail', { chatId: res.data.chat.id, name: res.data.order.executor.name }) },
                  { text: 'ОК' }
              ]);
            } catch (e: any) {
              logger.logNetworkError(aid, e, { orderId, applicationId });
              Alert.alert('Ошибка', 'Не удалось выбрать исполнителя');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const markViewed = async (appId: string, currentStatus: string) => {
      if (currentStatus === 'PENDING') {
          try {
              await apiService.markApplicationViewed(appId);
          } catch (e) {}
      }
  }

  const handleStartWork = async () => {
    if (submitting || order?.status !== 'CLAIMED') {
        return;
    }

    logger.action('START_WORK', 'UI', { orderId });
    const aid = logger.startAction('START_WORK', { orderId });
    const statusBefore = order?.status;
    setSubmitting(true);
    try {
      const res = await mapEngine.startOrder(orderId);
      // V11: Immediate local update to satisfy UI even before subscription fires
      if (res.data) setOrder(res.data);

      logger.logStateTransition('START_WORK', statusBefore, 'IN_PROGRESS', { orderId, actionId: aid });
      logger.endAction('START_WORK', { aid });
      Alert.alert('Успех', 'Статус заказа изменен на "В работе"');
    } catch (error: any) {
      logger.logNetworkError(aid, error, { orderId });
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось начать работу');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteWork = async () => {
    if (submitting || order?.status !== 'IN_PROGRESS') {
        return;
    }

    logger.action('COMPLETE_WORK', 'UI', { orderId });
    const aid = logger.startAction('COMPLETE_WORK', { orderId });
    const statusBefore = order?.status;
    setSubmitting(true);
    try {
      const res = await mapEngine.completeOrder(orderId);
      if (res.data) setOrder(res.data);

      logger.logStateTransition('COMPLETE_WORK', statusBefore, 'COMPLETED', { orderId, actionId: aid });
      logger.endAction('COMPLETE_WORK', { aid });
      Alert.alert('Успех', 'Заказ выполнен!', [
          { text: 'Оставить отзыв', onPress: () => setShowReviewModal(true) },
          { text: 'Позже' }
      ]);
    } catch (error: any) {
      logger.logNetworkError(aid, error, { orderId });
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось завершить работу');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async () => {
      if (rating === 0 || submitting) return;
      if (activeReviews.has(orderId)) return;
      const myReview = order?.reviews?.find(r => normalizeId(r.authorId) === nid);
      if (myReview) {
          Alert.alert('Инфо', 'Вы уже оставили отзыв');
          setShowReviewModal(false);
          return;
      }

      if (activeReviews.has(orderId)) return;
      activeReviews.add(orderId);
      logger.action('SUBMIT_REVIEW', 'UI', { orderId, rating });
      const aid = logger.startAction('SUBMIT_REVIEW', { orderId, rating });
      const statusBefore = order?.status;
      setSubmitting(true);
      try {
          const res = await apiService.createReview({
              rating,
              comment: reviewText,
              orderId
          });

          // Force invalidate cache to prevent status rollback
          mapEngine.requestRouter.invalidate(`order:${orderId}`);

          // Update local state immediately with the new review
          const newReview = res.data;
          setOrder(prev => {
              if (!prev) return prev;
              const reviews = prev.reviews || [];
              // Avoid duplicates
              if (reviews.some(r => normalizeId(r.authorId) === nid)) return prev;
              const updatedOrder = { ...prev, reviews: [...reviews, newReview] };
              return updatedOrder;
          });

          logger.logStateTransition('SUBMIT_REVIEW', statusBefore, 'COMPLETED', { orderId, actionId: aid });

          // Also sync from server to be sure
          mapEngine.syncOrder(orderId, true).then(updated => {
              if (updated) setOrder(updated);
          });
          logger.endAction('SUBMIT_REVIEW', { aid });
          Alert.alert('Спасибо!', 'Ваш отзыв важен для нас');
          setShowReviewModal(false);
      } catch (e: any) {
          logger.logNetworkError(aid, e, { orderId });
          const errorMessage = e.response?.data?.message || '';
          if (errorMessage.includes('already left a review') || errorMessage.includes('already reviewed') || e.response?.status === 409) {
              Alert.alert('Инфо', 'Вы уже оставили отзыв на этот заказ');
              setShowReviewModal(false);
              mapEngine.syncOrder(orderId, true).then(updated => {
                  if (updated) setOrder(updated);
              });
          } else {
              Alert.alert('Ошибка', errorMessage || 'Не удалось отправить отзыв');
          }
      } finally {
          setSubmitting(false);
          activeReviews.delete(orderId);
      }
  }

  const myId = currentUser?.uid || currentUser?.id;
  const normalizeId = (id) => id?.toString().trim().toLowerCase();
  const nid = normalizeId(myId);
  const isEmployer = !!nid && !!order?.employerId && nid === normalizeId(order.employerId);
  const isExecutor = !!nid && !!order?.executorId && nid === normalizeId(order.executorId);
  const hasApplied = !!myId && !!order?.applications?.some(a => a.executorId === myId);

  if (loading || !order) {
    return (
      <View style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrderDetails(true)} />}
      >
        <View style={styles.imageHeader}>
          {order.images && order.images.length > 0 ? (
            <Image source={{ uri: order.images[0] }} style={styles.mainImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
               <AppIcon name="action-attach" size={64} color={COLORS.border} />
               <Text style={{ color: COLORS.placeholder, marginTop: 10, fontWeight: '600' }}>Фото не добавлено</Text>
            </View>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
             <BlurView intensity={80} tint="light" style={styles.backBtnBlur}>
                <AppIcon name="nav-back" size={24} color={COLORS.dark} />
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
                order.status === 'COMPLETED' && { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
                false
            ]}>
               <Text style={[
                   styles.statusText,
                   order.status === 'PUBLISHED' && { color: COLORS.primary },
                   order.status === 'HAS_RESPONSES' && { color: '#F59E0B' },
                   order.status === 'CLAIMED' && { color: '#3B82F6' },
                   order.status === 'IN_PROGRESS' && { color: '#8B5CF6' },
                   order.status === 'COMPLETED' && { color: '#10B981' },
                   false
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
            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <AppIcon name="sys-location" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Адрес</Text>
                 <Text style={styles.infoValue}>{order.address}</Text>
               </View>
            </View>

            <View style={styles.infoItem}>
               <View style={styles.iconContainer}>
                 <AppIcon name="sys-calendar" size={22} color={COLORS.primary} />
               </View>
               <View style={styles.infoTextWrapper}>
                 <Text style={styles.infoLabel}>Дата выполнения</Text>
                 <Text style={styles.infoValue}>{formatDate(order.date)}</Text>
               </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Описание задачи</Text>
          <Text style={styles.description}>{order.details || 'Описание отсутствует'}</Text>

          {/* Milestones timeline */}
          {(() => {
            if (order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES' || order.status === 'CANCELLED') {
              return null;
            }

            const history = order.statusHistory || [];
            const claimedEntry = history.find((h: any) => h.newStatus === 'CLAIMED');
            const inProgressEntry = history.find((h: any) => h.newStatus === 'IN_PROGRESS');
            const completedEntry = history.find((h: any) => h.newStatus === 'COMPLETED');

            const formatTime = (dateStr: string) => {
              if (!dateStr) return '';
              const d = new Date(dateStr);
              return d.toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });
            };

            const isClaimed = !!claimedEntry || ['CLAIMED', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED'].includes(order.status);
            const isInProgress = !!inProgressEntry || ['IN_PROGRESS', 'COMPLETED', 'REVIEWED'].includes(order.status);
            const isCompleted = !!completedEntry || ['COMPLETED', 'REVIEWED'].includes(order.status);

            const claimedDate = claimedEntry?.createdAt || order.claimedAt;
            const inProgressDate = inProgressEntry?.createdAt;
            const completedDate = completedEntry?.createdAt;

            return (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>Ход выполнения</Text>

                <View style={styles.milestonesContainer}>
                  {/* Milestone 1: CLAIMED */}
                  <View style={styles.milestoneRow}>
                    <AppIcon name={isClaimed ? "status-done" : "status-incomplete"}
                      size={22}
                      color={isClaimed ? '#10B981' : COLORS.gray}
                    />
                    <View style={styles.milestoneTextContainer}>
                      <Text style={[styles.milestoneTitle, isClaimed && styles.milestoneActiveText]}>
                        Заказ принят в работу
                      </Text>
                      {isClaimed && claimedDate && (
                        <Text style={styles.milestoneDate}>
                          {formatTime(claimedDate)}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Milestone 2: IN_PROGRESS */}
                  <View style={styles.milestoneRow}>
                    <AppIcon name={isInProgress ? "status-done" : "status-incomplete"}
                      size={22}
                      color={isInProgress ? '#10B981' : COLORS.gray}
                    />
                    <View style={styles.milestoneTextContainer}>
                      <Text style={[styles.milestoneTitle, isInProgress && styles.milestoneActiveText]}>
                        Исполнитель начал работу
                      </Text>
                      {isInProgress && inProgressDate && (
                        <Text style={styles.milestoneDate}>
                          {formatTime(inProgressDate)}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Milestone 3: COMPLETED */}
                  <View style={styles.milestoneRow}>
                    <AppIcon name={isCompleted ? "status-done" : "status-incomplete"}
                      size={22}
                      color={isCompleted ? '#10B981' : COLORS.gray}
                    />
                    <View style={styles.milestoneTextContainer}>
                      <Text style={[styles.milestoneTitle, isCompleted && styles.milestoneActiveText]}>
                        Заказ завершён
                      </Text>
                      {isCompleted && completedDate && (
                        <Text style={styles.milestoneDate}>
                          {formatTime(completedDate)}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </>
            );
          })()}

          {(() => {
            const myReview = order?.reviews?.find(r => normalizeId(r.authorId) === nid);
            const otherReview = order?.reviews?.find(r => normalizeId(r.authorId) !== nid);

            if (!myReview) return null;

            return (
              <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>Отзывы</Text>
                  <View style={styles.reviewContent}>
                      <Text style={[styles.infoLabel, { marginBottom: 8 }]}>Ваш отзыв:</Text>
                      <View style={styles.starsRowLeft}>
                          {[1,2,3,4,5].map(s => <AppIcon key={s} name={s <= myReview.rating ? "sys-rating" : "sys-rating"} size={16} color={COLORS.warning} />)}
                      </View>
                      {myReview.comment ? <Text style={styles.reviewComment}>{myReview.comment}</Text> : null}

                      {!otherReview && (
                        <Text style={[styles.infoValue, { fontSize: 12, marginTop: 12, color: COLORS.gray, fontStyle: 'italic' }]}>
                          Вы оставили отзыв, ожидаем второго участника
                        </Text>
                      )}

                      {otherReview && (
                        <>
                          <View style={[styles.divider, { marginVertical: 12, opacity: 0.5 }]} />
                          <Text style={[styles.infoLabel, { marginBottom: 8 }]}>Отзыв от участника:</Text>
                          <View style={styles.starsRowLeft}>
                              {[1,2,3,4,5].map(s => <AppIcon key={s} name={s <= otherReview.rating ? "sys-rating" : "sys-rating"} size={16} color={COLORS.warning} />)}
                          </View>
                          {otherReview.comment ? <Text style={styles.reviewComment}>{otherReview.comment}</Text> : null}
                        </>
                      )}
                  </View>
              </>
            );
          })()}

          <View style={styles.divider} />

          {isEmployer && order.applications && order.applications.length > 0 && order.status === 'HAS_RESPONSES' && (
            <TouchableOpacity
              style={styles.applicationsBanner}
              onPress={() => {
                  logger.logClick('ViewApplications', 'OrderDetail', { orderId });
                  setShowApplications(true);
              }}
            >
              <View style={styles.applicationsBannerContent}>
                <AppIcon name="sys-friends" size={24} color={COLORS.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.bannerTitle}>{order.applications.length} откликов</Text>
                  <Text style={styles.bannerSubtitle}>Нажмите, чтобы выбрать исполнителя</Text>
                </View>
                <AppIcon name="nav-forward" size={20} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>{isEmployer && order.executor ? 'Ваш мастер' : 'Заказчик'}</Text>
          {isEmployer && order.executor ? (
              <TouchableOpacity
                style={styles.employerCard}
                activeOpacity={0.7}
                onPress={() => {
                    logger.logClick('ViewMasterProfile', 'OrderDetail', { masterId: order.executorId });
                    navigation.navigate('Profile', { userId: order.executorId });
                }}
              >
                <View style={styles.avatar}>
                   <Text style={styles.avatarText}>{(order.executor?.name || 'M')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                   <Text style={styles.employerName}>{order.executor?.name || 'Мастер'}</Text>
                   <View style={styles.ratingRow}>
                      <AppIcon name="sys-rating" size={14} color={COLORS.warning} />
                      <Text style={styles.ratingText}>{order.executor?.rating?.toFixed(1) || '5.0'}</Text>
                      <Text style={styles.ordersCount}>• {order.executor?.completedOrders || 0} завершено</Text>
                   </View>
                </View>
                <AppIcon name="nav-forward" size={20} color={COLORS.placeholder} />
              </TouchableOpacity>
          ) : (
              <TouchableOpacity
                style={styles.employerCard}
                activeOpacity={0.7}
                onPress={() => {
                    logger.logClick('ViewEmployerProfile', 'OrderDetail', { employerId: order.employerId });
                    navigation.navigate('Profile', { userId: order.employerId });
                }}
              >
                <View style={styles.avatar}>
                   <Text style={styles.avatarText}>{(order.employer?.name || 'U')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                   <Text style={styles.employerName}>{order.employer?.name || 'Заказчик'}</Text>
                   <View style={styles.ratingRow}>
                      <AppIcon name="sys-rating" size={14} color={COLORS.warning} />
                      <Text style={styles.ratingText}>{order.employer?.rating?.toFixed(1) || '5.0'}</Text>
                      <Text style={styles.ordersCount}>• {order.employer?.completedOrders || 0} завершено</Text>
                   </View>
                </View>
                <AppIcon name="nav-forward" size={20} color={COLORS.placeholder} />
              </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <BlurView intensity={90} tint="light" style={styles.footer}>
        <SafeAreaView edges={['bottom']} style={{ flexDirection: 'row', gap: 12 }}>
          {isEmployer ? (
              order.status === 'COMPLETED' && !(order?.reviews || []).some(r => normalizeId(r.authorId) === nid) ? (
                  <TouchableOpacity
                    style={[styles.applyBtn, { flex: 1 }]}
                    onPress={() => {
                        logger.logClick('OpenReviewModal', 'OrderDetail', { orderId });
                        setShowReviewModal(true);
                    }}
                  >
                    <Text style={styles.applyBtnText}>Оставить отзыв</Text>
                  </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.chatButtonFooter}
                  onPress={async () => {
                      logger.logClick('OpenChat', 'OrderDetail', { orderId, isEmployer: true });
                      if (order.executorId) {
                        const res = await apiService.getOrCreateChat(order.id, order.executorId);
                        navigation.navigate('ChatDetail', { chatId: res.data.id, name: order.executor?.name });
                      } else {
                        navigation.navigate('MainTabs', { screen: 'Chats' });
                      }
                  }}
                >
                  <AppIcon name="tab-chats" size={24} color={COLORS.primary} />
                  <Text style={styles.chatButtonTextFooter}>Сообщения</Text>
                </TouchableOpacity>
              )
          ) : isExecutor ? (
            <>
              <TouchableOpacity
                style={styles.iconChatBtn}
                onPress={async () => {
                    logger.logClick('OpenChat', 'OrderDetail', { orderId, isExecutor: true });
                    const res = await apiService.getOrCreateChat(order.id, myId!);
                    navigation.navigate('ChatDetail', { chatId: res.data.id, name: order.employer?.name });
                }}
              >
                <AppIcon name="tab-chats" size={24} color={COLORS.primary} />
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

              {(order.status === 'COMPLETED' || order.status === 'REVIEWED') && (
                order?.reviews?.some(r => normalizeId(r.authorId) === nid) ? (
                  <View style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.gray, opacity: 0.7 }]}>
                    <Text style={styles.applyBtnText}>Заказ выполнен</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.applyBtn, { flex: 1, backgroundColor: COLORS.primary }]}
                    onPress={() => {
                        logger.logClick('OpenReviewModal', 'OrderDetail', { orderId });
                        setShowReviewModal(true);
                    }}
                  >
                    <Text style={styles.applyBtnText}>Оставить отзыв</Text>
                  </TouchableOpacity>
                )
              )}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.iconChatBtn}
                onPress={async () => {
                    logger.logClick('OpenChat', 'OrderDetail', { orderId, isExecutor: false });
                    const res = await apiService.getOrCreateChat(order.id, myId!);
                    navigation.navigate('ChatDetail', { chatId: res.data.id, name: order.employer?.name });
                }}
              >
                <AppIcon name="tab-chats" size={24} color={COLORS.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.applyBtn,
                  { flex: 1 },
                  hasApplied && { backgroundColor: '#FF4757' },
                  ((order.status !== 'PUBLISHED' && order.status !== 'HAS_RESPONSES') || (order?.applications && order.applications.length >= 10)) && !hasApplied && { backgroundColor: COLORS.gray }
                ]}
                onPress={hasApplied ? handleCancelApplication : handleApply}
                disabled={submitting || (order.status !== 'PUBLISHED' && order.status !== 'HAS_RESPONSES' && !hasApplied) || (order?.applications && order.applications.length >= 10 && !hasApplied)}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.applyBtnText}>
                    {hasApplied ? 'Отказаться' : (order.status !== 'PUBLISHED' && order.status !== 'HAS_RESPONSES') ? 'Заказ занят' : (order?.applications && order.applications.length >= 10) ? 'Лимит откликов' : 'Откликнуться'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </SafeAreaView>
      </BlurView>

      <Modal
        visible={showPriceModal}
        transparent={true}
        animationType="fade"
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
                  <Text style={styles.modalTitleSmall}>Оцените работу мастера</Text>
                  <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map(s => (
                          <TouchableOpacity key={s} onPress={() => setRating(s)}>
                              <AppIcon name={s <= rating ? "sys-rating" : "sys-rating"} size={32} color={COLORS.warning} />
                          </TouchableOpacity>
                      ))}
                  </View>
                  <TextInput
                      style={[styles.priceInput, { height: 100, textAlignVertical: 'top' }]}
                      placeholder="Напишите ваш отзыв..."
                      multiline
                      value={reviewText}
                      onChangeText={setReviewText}
                  />
                  <TouchableOpacity
                      style={[styles.modalApplyBtn, submitting && { opacity: 0.6 }]}
                      onPress={submitReview}
                      disabled={submitting}
                  >
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
              <TouchableOpacity onPress={() => {
                  logger.logClick('CloseApplications', 'OrderDetail');
                  setShowApplications(false);
              }}>
                <AppIcon name="nav-close" size={32} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.applicationsList}>
              {order.applications?.map((app) => (
                <View key={app.id} style={styles.applicationCard}>
                  <View style={styles.appHeader}>
                    <TouchableOpacity
                        style={styles.avatarSmall}
                        onPress={() => {
                            logger.logClick('ViewApplicantProfile', 'OrderDetail', { masterId: app.executorId });
                            setShowApplications(false);
                            navigation.navigate('Profile', { userId: app.executorId });
                        }}
                    >
                       <Text style={styles.avatarTextSmall}>{app.executor?.name?.[0] || '?'}</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.executorName}>{app.executor?.name || 'Мастер'}</Text>
                        {app.status === 'PENDING' && <View style={styles.newBadge} />}
                      </View>
                      <View style={styles.ratingRow}>
                        <AppIcon name="sys-rating" size={14} color={COLORS.warning} />
                        <Text style={styles.ratingText}>{app.executor?.rating?.toFixed(1) || '5.0'}</Text>
                        <Text style={styles.ordersCount}>• {app.executor?.completedOrders || 0} заказов</Text>
                      </View>
                    </View>
                    <Text style={styles.offerPrice}>{app.price || order.price} ₽</Text>
                  </View>

                  <View style={styles.appActions}>
                     <TouchableOpacity
                      style={styles.appChatBtn}
                      onPress={async () => {
                        logger.logClick('OpenChatWithApplicant', 'OrderDetail', { orderId: order.id, masterId: app.executorId });
                        setShowApplications(false);
                        const res = await apiService.getOrCreateChat(order.id, app.executorId);
                        navigation.navigate('ChatDetail', { chatId: res.data.id, name: app.executor?.name });
                      }}
                     >
                       <AppIcon name="action-chat" size={20} color={COLORS.primary} />
                       <Text style={styles.appChatText}>Чат</Text>
                     </TouchableOpacity>

                     <TouchableOpacity
                      style={[styles.selectBtn, submitting && { opacity: 0.5 }]}
                      onPress={() => {
                          markViewed(app.id, app.status);
                          handleAcceptApplication(app.id);
                      }}
                      disabled={submitting}
                     >
                       <Text style={styles.selectBtnText}>Выбрать</Text>
                     </TouchableOpacity>
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
      marginBottom: 20 },
  starsRowLeft: {
      flexDirection: 'row',
      gap: 4,
      marginBottom: 8 },
  reviewContent: {
      backgroundColor: '#F8FAFC',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0' },
  reviewComment: {
      fontSize: 15,
      color: COLORS.dark,
      fontStyle: 'italic' },
  newBadge: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COLORS.primary,
      marginLeft: 6 },
  milestonesContainer: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
    marginTop: 8,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  milestoneTextContainer: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 15,
    color: COLORS.gray,
    fontWeight: '600',
  },
  milestoneActiveText: {
    color: COLORS.dark,
    fontWeight: '700',
  },
  milestoneDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  }
});

export default OrderDetailScreen;
