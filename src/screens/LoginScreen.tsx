import React, { useState } from 'react';
import { View, Text, Alert, SafeAreaView, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AppInput } from '../components/Input';
import { Button } from '../components/Button';
import { apiService } from '../services/ApiService';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (phone.length < 12) {
      Alert.alert("Ошибка", "Введите номер в формате +79991234567");
      return;
    }
    setLoading(true);
    try {
      // In this new architecture, we call our own backend
      const response = await apiService.login(phone);
      if (response.data.access_token) {
        await signIn(response.data.access_token, response.data.user);
        // Note: useAuth will trigger Navigation re-render
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert("Ошибка", "Не удалось войти. " + (err.response?.data?.message || err.message));
    }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="construct" size={50} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Добро пожаловать</Text>
            <Text style={styles.subtitle}>Войдите по номеру телефона</Text>
          </View>

          <View style={styles.form}>
            <AppInput
              label="Номер телефона"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+7 (___) ___-__-__"
              icon={<Ionicons name="call-outline" size={20} color={COLORS.gray} />}
            />
            <Button
              title="Войти / Регистрация"
              onPress={handleLogin}
              loading={loading}
            />
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  logoContainer: { width: 100, height: 100, borderRadius: 30, backgroundColor: COLORS.light, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.dark, marginBottom: 8 },
  subtitle: { fontSize: 16, color: COLORS.gray, textAlign: 'center' },
  form: { width: '100%' }
});
