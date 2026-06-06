import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, ScrollView } from 'react-native';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';
import { apiService } from '../services/ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RegisterDetailsScreen = ({ navigation, route }: any) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const phone = route?.params?.phone || '';

  const handleNext = async () => {
    if (!name.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, введите ФИО");
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.register({
        phone,
        name,
        role: 'WORKER' // Default, can be changed in RoleSelection
      });

      if (response.data.access_token) {
        await AsyncStorage.setItem('userToken', response.data.access_token);
        await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
        navigation.navigate('RoleSelection');
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert("Ошибка", err.response?.data?.message || "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Завершение регистрации</Text>
        <AppInput
          label="ФИО"
          value={name}
          onChangeText={setName}
          placeholder="Иван Иванов"
        />
        <Button
          title="Продолжить"
          onPress={handleNext}
          loading={loading}
          style={styles.button}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, color: '#333' },
  button: { marginTop: 20 }
});

export default RegisterDetailsScreen;
