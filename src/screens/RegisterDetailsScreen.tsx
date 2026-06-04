import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Button } from '../components/Button';
import { COLORS } from '../constants/theme';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [fio, setFio] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');

  const handleNext = () => {
    navigation.navigate('RoleSelection', { userData: { fio, birthDate: date, city } });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{flex: 1}}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ваши данные</Text>
        <Text style={styles.subtitle}>Вы можете заполнить эти данные позже в профиле, либо сейчас для экономии времени.</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>ФИО</Text>
          <TextInput
            style={styles.input}
            placeholder="Иван Иванов"
            value={fio}
            onChangeText={setFio}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Дата рождения</Text>
          <TextInput
            style={styles.input}
            placeholder="01.01.1990"
            value={date}
            onChangeText={setDate}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Город работы</Text>
          <TextInput
            style={styles.input}
            placeholder="Москва"
            value={city}
            onChangeText={setCity}
          />
        </View>

        <Button title="Далее" onPress={handleNext} />

        <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
          <Text style={styles.skipText}>Заполнить позже</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, color: COLORS.primary },
  subtitle: { fontSize: 16, color: COLORS.gray, marginBottom: 30 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, fontSize: 16 },
  skipBtn: { marginTop: 20, alignItems: 'center' },
  skipText: { color: COLORS.gray, fontSize: 16, textDecorationLine: 'underline' }
});

export default RegisterDetailsScreen;
