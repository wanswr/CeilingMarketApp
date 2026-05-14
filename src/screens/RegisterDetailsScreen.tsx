import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Button } from '../components/Button';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [fio, setFio] = useState('');
  const [date, setDate] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ваши данные</Text>
      <TextInput style={styles.input} placeholder="ФИО" value={fio} onChangeText={setFio} />
      <TextInput style={styles.input} placeholder="Дата рождения" value={date} onChangeText={setDate} />
      <Button title="Далее" onPress={() => navigation.navigate('RoleSelection')} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 15 }
});

export default RegisterDetailsScreen;