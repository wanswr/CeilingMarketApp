import React, { useState } from 'react';
import { logger } from '../services/logger/LoggerService';

import {
  TouchableOpacity,
  View,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useAuth } from '../context/AuthContext'
import { AppInput } from '../components/Input'
import { Button } from '../components/Button'
import { mapEngine } from '../services/MapEngine'
import { COLORS, SHADOWS } from '../constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { apiService } from '../services/ApiService'

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+7');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    if (phone.length < 12) {
      Alert.alert("Ошибка", "Введите номер в формате +79991234567");
      return;
    }
    if (!acceptedTerms) {
      Alert.alert("Согласие", "Пожалуйста, подтвердите согласие с политикой конфиденциальности");
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore
      const res = await apiService.api.post('auth/request-otp', { phone });
      if (res.data.status === 'sent') {
          navigation.navigate('VerifyCode', {
              phone,
              devCode: res.data.devCode // For dev convenience as requested
          });
      }
    } catch (err: any) {
      logger.error("UI_ERROR", { error: err });
      let errorMsg = "Произошла ошибка при запросе кода.";
      if (err.message === "Network Error") {
        errorMsg = "Ошибка сети. Убедитесь, что сервер запущен.";
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      Alert.alert("Ошибка", errorMsg);
    }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={styles.gradient}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <SafeAreaView style={{ flex: 1 }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.content}
            >
              <View style={styles.header}>
                <LinearGradient colors={['#2D5BFF', '#8257E5']} style={styles.logoContainer}>
                  <Ionicons name="construct" size={50} color="#fff" />
                </LinearGradient>
                <Text style={styles.title}>CeilingsApp</Text>
                <Text style={styles.subtitle}>Профессиональный маркетплейс мастеров по потолкам</Text>
              </View>

              <BlurView intensity={90} tint="light" style={styles.formCard}>
                <Text style={styles.formTitle}>Вход или регистрация</Text>
                <AppInput
                  label="Номер телефона"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+7 (___) ___-__-__"
                  icon={<Ionicons name="call-outline" size={20} color={COLORS.primary} />}
                />
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAcceptedTerms(!acceptedTerms)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                    {acceptedTerms && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.termsTextLabel}>
                    Согласен с <Text style={styles.termsLink}>Политикой конфиденциальности</Text> и обработкой персональных данных
                  </Text>
                </TouchableOpacity>

                <Button
                  title="Получить код"
                  onPress={handleRequestOtp}
                  loading={loading}
                  style={[styles.loginBtn, !acceptedTerms && { opacity: 0.6 }]}
                />
              </BlurView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  gradient: { flex: 1 },
  content: { flex: 1, padding: 30, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 50 },
  logoContainer: {
    width: 100, height: 100, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, ...SHADOWS.medium
  },
  title: { fontSize: 36, fontWeight: '900', color: COLORS.dark, letterSpacing: -1.5 },
  subtitle: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 10, paddingHorizontal: 20, lineHeight: 22 },
  formCard: {
    width: '100%', padding: 24, borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)',
    ...SHADOWS.heavy
  },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginBottom: 24, textAlign: 'center' },
  loginBtn: { marginTop: 10, height: 60, borderRadius: 18 },
  termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.primary, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: COLORS.primary },
  termsTextLabel: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 16 },
  termsLink: { color: COLORS.primary, fontWeight: '700' }
});
