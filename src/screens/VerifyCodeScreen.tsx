import React, { useState, useEffect } from 'react';
import { View, Text, Alert, SafeAreaView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function VerifyCodeScreen({ route, navigation }: any) {
  const { phoneNumber, verificationId } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code);
      await signInWithCredential(auth, credential);
      // Navigation will be handled by auth state listener in Navigation/index.tsx
    }
    catch (err) {
      Alert.alert("Ошибка", "Введен неверный код подтверждения");
    }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Подтверждение</Text>
              <Text style={styles.subtitle}>
                Мы отправили SMS с кодом на номер{'\n'}
                <Text style={styles.phoneText}>{phoneNumber}</Text>
              </Text>
            </View>

            <View style={styles.form}>
              <AppInput
                label="Код подтверждения"
                value={code}
                onChangeText={(t:any) => {
                  setCode(t);
                  if(t.length === 6) handleVerify();
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                placeholder="000000"
                style={styles.codeInput}
              />

              <Button
                title="Войти"
                onPress={handleVerify}
                loading={loading}
                disabled={code.length < 6}
              />

              <View style={styles.resendContainer}>
                {timer > 0 ? (
                  <Text style={styles.resendText}>
                    Отправить код повторно через {timer} сек.
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => Alert.alert("Инфо", "Код отправлен повторно")}>
                    <Text style={styles.resendLink}>Отправить код еще раз</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
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
  backButton: {
    padding: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 20,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray,
    lineHeight: 24,
  },
  phoneText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  form: {
    width: '100%',
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  resendContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  resendText: {
    color: COLORS.gray,
    fontSize: 14,
  },
  resendLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  }
});
