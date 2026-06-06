import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';
import { apiService } from '../services/ApiService';

const ProfileScreen = ({ navigation }: any) => {
  const [role, setRole] = useState(orderService.getCurrentRole());
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      // In a real app, 'me' would be handled by JWT on backend
      const response = await apiService.getUserProfile('me');
      setProfile(response.data);
    } catch (e) {
      console.error("Error fetching profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const next = role === 'employer' ? 'worker' : 'employer';
    try {
      await orderService.setRole(next);
      setRole(next);
      fetchProfile();
      Alert.alert("Роль изменена", `Вы вошли как ${next === 'employer' ? 'Заказчик' : 'Мастер'}`);
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сменить роль");
    }
  };

  const handleLogout = async () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        onPress: async () => {
          await AsyncStorage.removeItem('userToken');
          // Reset navigation or handle logout state
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
        style: "destructive"
      }
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
          <View style={[styles.avatarContainer, { borderColor: role === 'employer' ? COLORS.secondary : COLORS.primary }]}>
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={50} color="#ccc" />
            )}
            {profile?.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{profile?.name || 'Имя не указано'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{role === 'employer' ? 'ЗАКАЗЧИК' : 'МАСТЕР'}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.rating?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.statLabel}>Рейтинг</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.experience || '0'}</Text>
            <Text style={styles.statLabel}>Лет опыта</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{role === 'employer' ? profile?.ordersCount || 0 : profile?.completedOrders || 0}</Text>
            <Text style={styles.statLabel}>{role === 'employer' ? 'Заказов' : 'Выполнено'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.btn} onPress={toggle}>
        <Text>Сменить роль</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={handleLogout}>
        <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#fff', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  avatarContainer: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderWidth: 3, position: 'relative' },
  avatar: { width: '100%', height: '100%', borderRadius: 55 },
  verifiedBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#fff', borderRadius: 12 },
  name: { fontSize: 22, fontWeight: '800', marginTop: 15, color: COLORS.dark },
  roleBadge: { backgroundColor: COLORS.bgLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  roleText: { fontSize: 10, fontWeight: '900', color: COLORS.gray, letterSpacing: 1 },
  statsContainer: { flexDirection: 'row', marginTop: 25, width: '100%', paddingHorizontal: 20 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border, alignSelf: 'center' },
  btn: { marginHorizontal: 20, marginTop: 15, padding: 18, backgroundColor: '#fff', borderRadius: 20, alignItems: 'center' }
});

export default ProfileScreen;
