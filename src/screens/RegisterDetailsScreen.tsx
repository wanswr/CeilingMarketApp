import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { Button } from '../components/Button';
import { db, auth } from '../services/firebase';

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
    <View style={styles.container}>
      <Text style={styles.title}>Ваши данные</Text>
      <TextInput
        style={styles.input}
        placeholder="ФИО"
        value={fio}
        onChangeText={setFio}
      />
      <TextInput
        style={styles.input}
        placeholder="Дата рождения"
        value={date}
        onChangeText={setDate}
      />
      <Button
        title={loading ? "Загрузка..." : "Далее"}
        onPress={handleNext}
        disabled={loading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 15 }
});

export default RegisterDetailsScreen;
