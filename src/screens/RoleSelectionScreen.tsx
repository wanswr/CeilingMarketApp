import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS } from '../constants/theme'
import { mapEngine } from '../services/MapEngine'
import { useAuth } from '../context/AuthContext'

const RoleSelectionScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(false);
  const { updateUser } = useAuth();

  const selectRole = async (role: 'WORKER' | 'EMPLOYER') => {
    setLoading(true);
    try {
      const data = await mapEngine.setRole(role);
      updateUser(data);
      // navigation.replace('MainTabs') is not needed, useAuth re-renders Navigation
    } catch (error: any) {
      if (error.response?.status === 403) {
        Alert.alert('Инфо', 'Роль уже была установлена ранее');
        try {
          const freshProfile = await mapEngine.syncUser(true);
          updateUser(freshProfile);
        } catch (e) {
          // fallback ignore
        }
      } else {
        Alert.alert('Ошибка', 'Не удалось сохранить выбор роли');
      }
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
