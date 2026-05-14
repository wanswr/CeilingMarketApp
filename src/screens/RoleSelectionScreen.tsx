import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const RoleSelectionScreen = ({ navigation }: any) => {
  const selectRole = (role: string) => {
    // В будущем здесь будет сохранение роли в базу
    navigation.replace('MainApp');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Кто вы?</Text>
      <TouchableOpacity style={styles.card} onPress={() => selectRole('worker')}>
        <Text style={styles.cardTitle}>Монтажник</Text>
        <Text>Ищу заказы</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => selectRole('employer')}>
        <Text style={styles.cardTitle}>Работодатель</Text>
        <Text>Создаю заказы</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  card: { backgroundColor: '#f0f7ff', padding: 25, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#007AFF' },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#007AFF' }
});

export default RoleSelectionScreen;