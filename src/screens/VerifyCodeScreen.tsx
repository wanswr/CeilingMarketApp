import React, { useState, useEffect } from 'react';

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
  TextInput,
  ActivityIndicator
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/Button'
import { COLORS, SHADOWS } from '../constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { apiService } from '../services/ApiService'

export default function VerifyCodeScreen({ route, navigation }: any) {
  const { phone, devCode } = route.params || {};
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    if (devCode) {
        Alert.alert("Dev Mode", `Ваш код: ${devCode}`);
    }
  }, [devCode]);

  const handleVerify = async () => {
    if (code.length < 4) {
      Alert.alert("Ошибка", "Введите 4-значный код");
      return;
    }
    setLoading(true);
    try {
      await login(phone, code);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Ошибка", err.response?.data?.message || "Неверный код");
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
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                  <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
              </TouchableOpacity>

              <View style={styles.header}>
                <Text style={styles.title}>Подтверждение</Text>
                <Text style={styles.subtitle}>Мы отправили код на номер {phone}</Text>
              </View>

              <BlurView intensity={90} tint="light" style={styles.formCard}>
                <TextInput
                  style={styles.codeInput}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="0000"
                  maxLength={4}
                  autoFocus
                />

                <Button
                  title="Проверить код"
                  onPress={handleVerify}
                  loading={loading}
                  style={styles.verifyBtn}
                />

                <TouchableOpacity style={styles.resendBtn}>
                    <Text style={styles.resendText}>Отправить код повторно</Text>
                </TouchableOpacity>
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
  backBtn: { position: 'absolute', top: 20, left: 20, zIndex: 10 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '900', color: COLORS.dark, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 10 },
  formCard: {
    width: '100%', padding: 24, borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)',
    ...SHADOWS.heavy,
    alignItems: 'center'
  },
  codeInput: {
      fontSize: 48,
      fontWeight: 'bold',
      color: COLORS.primary,
      letterSpacing: 20,
      textAlign: 'center',
      marginBottom: 30,
      width: '100%'
  },
  verifyBtn: { width: '100%', height: 60, borderRadius: 18 },
  resendBtn: { marginTop: 20 },
  resendText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 }
});
