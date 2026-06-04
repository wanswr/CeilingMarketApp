import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';
import { auth } from '../services/firebase';

const RoleSelectionScreen = ({ navigation, route }: any) => {
  const [loading, setLoading] = useState(false);
  const { userData } = route.params || {};

  const selectRole = async (role: 'worker' | 'employer') => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      await orderService.createUserProfile(auth.currentUser.uid, {
        ...userData,
        role
      });
      orderService.setRole(role);
      // navigation.replace('MainApp') handled by auth listener in navigation/index.tsx
    } catch (e) {
      console.error(e);
      Alert.alert("Ошибка", "Не удалось сохранить профиль");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Кто вы?</Text>
      <Text style={styles.subtitle}>Выберите вашу основную роль в приложении</Text>

      <TouchableOpacity style={[styles.card, { borderColor: COLORS.primary }]} onPress={() => selectRole('worker')}>
        <View style={styles.iconContainer}>
          <Ionicons name="construct" size={40} color={COLORS.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Мастер</Text>
          <Text style={styles.cardDesc}>Ищу заказы по установке потолков</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={COLORS.gray} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, { borderColor: COLORS.secondary }]} onPress={() => selectRole('employer')}>
        <View style={styles.iconContainer}>
          <Ionicons name="briefcase" size={40} color={COLORS.secondary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: COLORS.secondary }]}>Работодатель</Text>
          <Text style={styles.cardDesc}>Размещаю заказы и ищу исполнителей</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={COLORS.gray} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, color: COLORS.gray, marginBottom: 40, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  cardDesc: { fontSize: 14, color: COLORS.gray, marginTop: 4 }
});

export default RoleSelectionScreen;
