import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { apiService } from '../services/ApiService';
import { COLORS } from '../constants/theme';
import { Button } from '../components/Button';

const SubscriptionScreen = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await apiService.getProfile();
      setStatus(response.data.subscription);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubscribe = async (days: number) => {
    setLoading(true);
    try {
      await apiService.activateSubscription(days);
      Alert.alert('Успех', 'Подписка активирована!');
      fetchStatus();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось оформить подписку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Управление подпиской</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Статус:</Text>
          <Text style={[styles.statusValue, { color: status?.isActive ? '#4CAF50' : '#F44336' }]}>
            {status?.isActive ? 'Активна' : 'Не активна'}
          </Text>
          {status?.isActive && (
            <Text style={styles.expiry}>Действует до: {new Date(status.activeUntil).toLocaleDateString()}</Text>
          )}
        </View>

        <Text style={styles.subtitle}>Выберите тариф:</Text>

        <TouchableOpacity style={styles.plan} onPress={() => handleSubscribe(30)} disabled={loading}>
          <View>
            <Text style={styles.planName}>Месяц</Text>
            <Text style={styles.planPrice}>990 ₽</Text>
          </View>
          <Text style={styles.planAction}>Выбрать</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.plan} onPress={() => handleSubscribe(90)} disabled={loading}>
          <View>
            <Text style={styles.planName}>3 Месяца</Text>
            <Text style={styles.planPrice}>2490 ₽</Text>
          </View>
          <Text style={styles.planAction}>Выбрать</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  statusCard: {
    backgroundColor: '#f8f9fa', padding: 20, borderRadius: 15, marginBottom: 30,
    borderWidth: 1, borderColor: '#eee'
  },
  statusLabel: { fontSize: 14, color: '#666' },
  statusValue: { fontSize: 20, fontWeight: 'bold', marginVertical: 5 },
  expiry: { fontSize: 12, color: '#999' },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  plan: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: '#fff', borderRadius: 12, marginBottom: 15,
    borderWidth: 1, borderColor: '#eee', elevation: 2
  },
  planName: { fontSize: 16, fontWeight: 'bold' },
  planPrice: { fontSize: 14, color: COLORS.primary },
  planAction: { color: COLORS.primary, fontWeight: '600' }
});

export default SubscriptionScreen;
