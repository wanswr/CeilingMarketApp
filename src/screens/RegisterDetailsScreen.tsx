import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, ScrollView } from 'react-native';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';
import { apiService } from '../services/ApiService';
import { useAuth } from '../context/AuthContext';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { updateUser } = useAuth();

  const handleNext = async () => {
    if (!name.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, введите ФИО");
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.updateProfile({
        name
      });

      updateUser(response.data);
      navigation.navigate('RoleSelection');
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
