import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';
import { db, auth } from '../services/firebase';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [fio, setFio] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!fio || !date) {
      Alert.alert("Ошибка", "Заполните все поля");
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await db.collection("users").doc(user.uid).set({
          fio,
          birthDate: date,
          phoneNumber: user.phoneNumber,
          createdAt: new Date().toISOString()
        }, { merge: true });
        navigation.navigate('RoleSelection');
      }
    } catch (err: any) {
      Alert.alert("Ошибка", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{flex: 1}}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Давайте познакомимся</Text>
              <Text style={styles.subtitle}>Заполните информацию о себе для начала работы</Text>
            </View>

            <View style={styles.form}>
              <AppInput
                label="ФИО"
                placeholder="Иванов Иван Иванович"
                value={fio}
                onChangeText={setFio}
                icon={<Ionicons name="person-outline" size={20} color={COLORS.gray} />}
              />
              <AppInput
                label="Дата рождения"
                placeholder="01.01.1990"
                value={date}
                onChangeText={setDate}
                icon={<Ionicons name="calendar-outline" size={20} color={COLORS.gray} />}
              />

              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.success} />
                <Text style={styles.infoText}>Ваши данные защищены и используются только для верификации внутри платформы</Text>
              </View>

              <Button
                title="Продолжить"
                onPress={handleNext}
                loading={loading}
                disabled={!fio || !date}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  header: { marginBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.dark, marginBottom: 10 },
  subtitle: { fontSize: 16, color: COLORS.gray, lineHeight: 24 },
  form: { width: '100%' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center'
  },
  infoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#166534', lineHeight: 18 }
});

export default RegisterDetailsScreen;
