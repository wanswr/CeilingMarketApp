import React, { useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, Keyboard, ImageBackground, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../context/AuthContext';
import { AppInput } from '../components/Input';
import { Button } from '../components/Button';
import { mapEngine } from '../services/MapEngine';
import { COLORS, SHADOWS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (phone.length < 12) {
      Alert.alert("Ошибка", "Введите номер в формате +79991234567");
      return;
    }
    if (!isAgreed) {
        Alert.alert("Внимание", "Для продолжения необходимо согласиться с условиями обработки персональных данных.");
        return;
    }
    setLoading(true);
    try {
      // In this new architecture, we call our own backend via Orchestrator
      const data = await mapEngine.login(phone);
      if (data.access_token) {
        await signIn(data.access_token, data.user);
        // Note: useAuth will trigger Navigation re-render
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = "Произошла ошибка при входе.";
      if (err.message === "Network Error") {
        errorMsg = "Ошибка сети. Убедитесь, что сервер запущен и доступен по адресу " + mapEngine.getApiBaseUrl();
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      Alert.alert("Ошибка входа", errorMsg);
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
                    style={styles.checkboxRow}
                    onPress={() => setIsAgreed(!isAgreed)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkbox, isAgreed && styles.checkboxChecked]}>
                        {isAgreed && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>
                        Я согласен на <Text style={styles.termsLink}>обработку персональных данных</Text>
                    </Text>
                </TouchableOpacity>

                <Button
                  title="Продолжить"
                  onPress={handleLogin}
                  loading={loading}
                  style={styles.loginBtn}
                />
                <Text style={styles.termsText}>
                  Нажимая кнопку, вы соглашаетесь с условиями{"\n"}
                  <Text style={styles.termsLink}>Публичной оферты</Text>
                </Text>
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
  termsText: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginTop: 20, lineHeight: 18 },
  termsLink: { color: COLORS.primary, fontWeight: '700' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxLabel: { flex: 1, fontSize: 13, color: COLORS.gray }
});
