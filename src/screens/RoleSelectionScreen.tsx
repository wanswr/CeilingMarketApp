import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { COLORS } from '../constants/theme';
import { apiService } from '../services/ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RoleSelectionScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(false);

  const selectRole = async (role: 'WORKER' | 'EMPLOYER') => {
    setLoading(true);
    try {
      await apiService.updateProfile({ role });
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        user.role = role;
        await AsyncStorage.setItem('userData', JSON.stringify(user));
      }
      navigation.replace('MainTabs');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сохранить выбор роли');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Выберите вашу роль</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => selectRole('WORKER')}
          disabled={loading}
        >
          <Text style={styles.cardTitle}>Я Исполнитель</Text>
          <Text style={styles.cardDesc}>Хочу находить работу и зарабатывать</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => selectRole('EMPLOYER')}
          disabled={loading}
        >
          <Text style={styles.cardTitle}>Я Заказчик</Text>
          <Text style={styles.cardDesc}>Хочу размещать заказы и находить помощь</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 },
  card: {
    backgroundColor: '#f8f9fa',
    padding: 30,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center'
  },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10 },
  cardDesc: { fontSize: 14, color: '#666', textAlign: 'center' }
});

export default RoleSelectionScreen;
