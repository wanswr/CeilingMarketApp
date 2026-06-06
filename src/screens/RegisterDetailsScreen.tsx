import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';
import { apiService } from '../services/ApiService';
import { COLORS } from '../constants/theme';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [fio, setFio] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    setLoading(true);
    try {
      await apiService.register({ name: fio, birthDate: date });
      navigation.navigate('RoleSelection');
    } catch (err: any) {
      Alert.alert("Ошибка", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppInput label="ФИО" value={fio} onChangeText={setFio} />
        <Button title="Продолжить" onPress={handleNext} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 }
});

export default RegisterDetailsScreen;
