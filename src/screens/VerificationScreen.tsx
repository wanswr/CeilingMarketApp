import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/ApiService';
import { COLORS, SHADOWS, SPACING } from '../constants/theme';
import { logger } from '../services/logger/LoggerService';

export default function VerificationScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await apiService.getProfile();
      setUser(res.data);
    } catch (e: any) {
      logger.error('[VerificationScreen] Failed to load user profile', { error: e.message });
      Alert.alert('Ошибка', 'Не удалось загрузить данные профиля.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleVerify = async () => {
    Alert.alert(
      'Режим настройки',
      'Верификация временно недоступна. Функция биометрического сканирования лиц (Liveness SDK) и распознавания паспортов находится в стадии интеграции нашими инженерами.\n\nПожалуйста, ожидайте официального обновления приложения!'
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Calculate breakdown values for transparency
  const basePoints = 50;
  const verifiedPoints = user?.isVerified ? 20 : 0;
  const expPoints = Math.min(user?.experience || 0, 5) * 2;
  const ordersPoints = Math.min(user?.completedOrders || 0, 10) * 2;

  let ratingPoints = 0;
  if (user?.rating !== null && user?.rating !== undefined) {
    const diff = user.rating - 3;
    ratingPoints = Math.round(diff * 10);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Header */}
        <View style={[styles.card, styles.statusCard, user?.isVerified && styles.statusCardVerified]}>
          <View style={styles.statusRow}>
            <Ionicons
              name={user?.isVerified ? "shield-checkmark-sharp" : "alert-circle-outline"}
              size={48}
              color={user?.isVerified ? '#10B981' : COLORS.warning}
            />
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.statusTitle}>
                {user?.isVerified ? 'Профиль подтвержден' : 'Профиль не подтвержден'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {user?.isVerified ? 'Ваша личность успешно верифицирована.' : 'Функция подтверждения личности в процессе настройки.'}
              </Text>
            </View>
          </View>

          {!user?.isVerified && (
            <TouchableOpacity
              style={[styles.verifyBtn, { backgroundColor: COLORS.gray }]}
              onPress={handleVerify}
            >
              <Ionicons name="construct-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.verifyBtnText}>Верификация настраивается</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Index Trust Section */}
        <Text style={styles.sectionTitle}>Прозрачный Индекс Доверия</Text>
        <Text style={styles.sectionSubtitle}>
          Индекс доверия рассчитывается автоматически на основе объективных показателей вашего профиля:
        </Text>

        <View style={styles.card}>
          <View style={styles.indexRow}>
            <Text style={styles.indexTotalLabel}>Итоговый индекс:</Text>
            <Text style={[styles.indexTotalValue, { color: (user?.trustScore || 50) >= 80 ? '#10B981' : COLORS.warning }]}>
              {user?.trustScore || 50}/100
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Breakdown Items */}
          <View style={styles.factorRow}>
            <Ionicons name="key-outline" size={18} color={COLORS.gray} style={styles.factorIcon} />
            <Text style={styles.factorLabel}>Базовый уровень:</Text>
            <Text style={styles.factorValue}>+{basePoints} баллов</Text>
          </View>

          <View style={styles.factorRow}>
            <Ionicons
              name={user?.isVerified ? "checkmark-circle-outline" : "ellipse-outline"}
              size={18}
              color={user?.isVerified ? '#10B981' : COLORS.gray}
              style={styles.factorIcon}
            />
            <Text style={styles.factorLabel}>Верификация личности:</Text>
            <Text style={[styles.factorValue, user?.isVerified && { color: '#10B981', fontWeight: 'bold' }]}>
              {user?.isVerified ? '+20 баллов' : '0 баллов'}
            </Text>
          </View>

          <View style={styles.factorRow}>
            <Ionicons name="briefcase-outline" size={18} color={COLORS.primary} style={styles.factorIcon} />
            <Text style={styles.factorLabel}>Профессиональный стаж ({user?.experience || 0}г.):</Text>
            <Text style={styles.factorValue}>+{expPoints} баллов</Text>
          </View>

          <View style={styles.factorRow}>
            <Ionicons name="checkmark-done-circle-outline" size={18} color="#10B981" style={styles.factorIcon} />
            <Text style={styles.factorLabel}>Выполнено заказов ({user?.completedOrders || 0}):</Text>
            <Text style={styles.factorValue}>+{ordersPoints} баллов</Text>
          </View>

          <View style={styles.factorRow}>
            <Ionicons name="star-outline" size={18} color={COLORS.warning} style={styles.factorIcon} />
            <Text style={styles.factorLabel}>Средний рейтинг ({user?.rating?.toFixed(1) || '5.0'}):</Text>
            <Text style={[styles.factorValue, ratingPoints < 0 && { color: COLORS.danger }]}>
              {ratingPoints >= 0 ? `+${ratingPoints}` : ratingPoints} баллов
            </Text>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={styles.infoBoxText}>
            Индекс доверия напрямую влияет на отображение ваших откликов у работодателей. Пользователи с высоким индексом верификации отображаются вверху списка претендентов.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scrollContent: { padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    ...SHADOWS.soft,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.4)'
  },
  statusCard: {
    borderColor: COLORS.warning + '30',
    borderWidth: 1,
    backgroundColor: COLORS.warning + '05'
  },
  statusCardVerified: {
    borderColor: '#10B98130',
    backgroundColor: '#10B98105'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark
  },
  statusSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500'
  },
  verifyBtn: {
    backgroundColor: COLORS.primary,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.soft
  },
  verifyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 6,
    marginLeft: 4
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 15,
    marginLeft: 4,
    lineHeight: 18,
    fontWeight: '500'
  },
  indexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4
  },
  indexTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark
  },
  indexTotalValue: {
    fontSize: 24,
    fontWeight: '900'
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10
  },
  factorIcon: {
    marginRight: 10
  },
  factorLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark
  },
  factorValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.gray
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '08',
    borderColor: COLORS.primary + '20',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 30
  },
  infoBoxText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    lineHeight: 18,
    fontWeight: '600'
  }
});
