import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { apiService } from '../services/ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { Button } from '../components/Button';

const ProfileScreen = ({ navigation }: any) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await apiService.getProfile();
      setUser(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.replace('Auth');
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={COLORS.primary} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{user?.name?.[0] || 'U'}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
        <Text style={styles.role}>{user?.role === 'WORKER' ? 'Исполнитель' : 'Заказчик'}</Text>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Subscription')}>
          <Text style={styles.menuText}>Подписка</Text>
          <Text style={styles.menuSubtext}>
            {user?.subscription?.isActive ? 'Активна' : 'Не активна'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('В разработке')}>
          <Text style={styles.menuText}>История заказов</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('В разработке')}>
          <Text style={styles.menuText}>Настройки</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Выйти"
        onPress={handleLogout}
        style={styles.logoutBtn}
        variant="outline"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { alignItems: 'center', padding: 30, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 15
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  name: { fontSize: 22, fontWeight: 'bold' },
  phone: { fontSize: 16, color: '#666', marginTop: 5 },
  role: { fontSize: 14, color: COLORS.primary, marginTop: 5, fontWeight: '600' },
  menu: { padding: 20 },
  menuItem: {
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  menuText: { fontSize: 16, color: '#333' },
  menuSubtext: { fontSize: 14, color: COLORS.primary },
  logoutBtn: { margin: 20, marginTop: 'auto' }
});

export default ProfileScreen;
