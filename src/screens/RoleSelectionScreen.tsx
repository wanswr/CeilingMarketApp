import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';

const RoleSelectionScreen = ({ navigation }: any) => {
  const selectRole = async (role: 'worker' | 'employer') => {
    try {
      await orderService.setRole(role);
      navigation.replace('MainTabs');
    } catch (err: any) {
      Alert.alert("Ошибка", err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Выберите роль</Text>
        <TouchableOpacity style={styles.card} onPress={() => selectRole('worker')}>
          <LinearGradient colors={['#F0F7FF', '#E1EFFF']} style={styles.cardGradient}>
            <Text style={styles.cardTitle}>Мастер</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => selectRole('employer')}>
          <LinearGradient colors={['#FDF4FF', '#F5E6FF']} style={styles.cardGradient}>
            <Text style={styles.cardTitle}>Заказчик</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 40 },
  card: { marginBottom: 20, borderRadius: 24 },
  cardGradient: { padding: 24, borderRadius: 24, alignItems: 'center' },
  cardTitle: { fontSize: 20, fontWeight: '800' }
});

export default RoleSelectionScreen;
