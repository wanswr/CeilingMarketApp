import React, { useState, useRef } from 'react';
import { View, Text, Alert, SafeAreaView, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../services/firebase';
import { AppInput } from '../components/Input';
import { Button } from '../components/Button';
import app from '../services/firebase';
import { COLORS } from '../constants/theme';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);
  const recaptchaVerifier = useRef<any>(null);

  React.useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const savedPhone = await SecureStore.getItemAsync('saved_phone');
      if (savedPhone) {
        setPhone(savedPhone);
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Вход по биометрии',
          fallbackLabel: 'Использовать пароль',
        });

        if (result.success) {
          // Logic for automatic login with biometrics would go here
        }
      }
    }
  };

  const handleSendCode = async () => {
    if (phone.length < 12) {
      Alert.alert("Ошибка", "Введите номер в формате +79991234567");
      return;
    }
    setLoading(true);
    try {
      const phoneProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        phone,
        recaptchaVerifier.current
      );
      navigation.navigate('VerifyCode', { phoneNumber: phone, verificationId });
    } catch (err: any) {
      console.error(err);
      Alert.alert("Ошибка", "Не удалось отправить код. " + err.message);
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
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifier}
            firebaseConfig={app.options}
            attemptInvisibleVerification={true}
          />

          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="construct" size={50} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Добро пожаловать</Text>
            <Text style={styles.subtitle}>Войдите, чтобы продолжить работу</Text>
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
              title="Получить код"
              onPress={handleSendCode}
              loading={loading}
            />
            <Text style={styles.footerText}>
              Нажимая кнопку, вы соглашаетесь с условиями использования и политикой конфиденциальности
            </Text>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  footerText: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
    paddingHorizontal: 20,
  }
});
