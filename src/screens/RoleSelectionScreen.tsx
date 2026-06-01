import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { db, auth } from '../services/firebase';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const RoleSelectionScreen = ({ navigation }: any) => {
  const selectRole = async (role: 'worker' | 'employer') => {
    try {
      const user = auth.currentUser;
      if (user) {
        const subscriptionUntil = new Date();
        subscriptionUntil.setDate(subscriptionUntil.getDate() + 7); // 7 days trial

        await db.collection("users").doc(user.uid).update({
          role: role,
          subscriptionUntil: subscriptionUntil.toISOString(),
          isTrialUsed: true,
        });
        // Navigation state in navigation/index.tsx will automatically switch to MainApp
      }
    } catch (err: any) {
      Alert.alert("Ошибка", err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Выберите роль</Text>
          <Text style={styles.subtitle}>Это поможет нам адаптировать приложение под ваши цели</Text>
        </View>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => selectRole('worker')}
        >
          <LinearGradient
            colors={['#F0F7FF', '#E1EFFF']}
            style={styles.cardGradient}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="hammer-outline" size={32} color={COLORS.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Я — Мастер</Text>
              <Text style={styles.cardSubtitle}>Хочу находить заказы по установке потолков</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => selectRole('employer')}
        >
          <LinearGradient
            colors={['#FDF4FF', '#F5E6FF']}
            style={[styles.cardGradient, { borderColor: '#AF52DE20' }]}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#F5E6FF' }]}>
              <Ionicons name="briefcase-outline" size={32} color="#AF52DE" />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: '#AF52DE' }]}>Я — Заказчик</Text>
              <Text style={styles.cardSubtitle}>Ищу мастеров для выполнения работ</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#AF52DE" />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.footerNote}>Вы всегда сможете сменить роль в настройках профиля</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.dark, marginBottom: 12 },
  subtitle: { fontSize: 16, color: COLORS.gray, lineHeight: 24 },
  card: {
    marginBottom: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E1EFFF',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E1EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: { flex: 1, marginLeft: 20 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: COLORS.gray, lineHeight: 20 },
  footerNote: { textAlign: 'center', color: COLORS.gray, fontSize: 14, marginTop: 20 }
});

export default RoleSelectionScreen;
