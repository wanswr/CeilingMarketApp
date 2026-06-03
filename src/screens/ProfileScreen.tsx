import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';
import { auth } from '../services/firebase';

const ProfileScreen = () => {
  const [role, setRole] = useState(orderService.getCurrentRole());

  useEffect(() => {
    const sync = (r: any) => setRole(r);
    orderService.on('roleChanged', sync);
    return () => { orderService.off('roleChanged', sync); };
  }, []);

  const toggle = () => {
    const next = role === 'employer' ? 'worker' : 'employer';
    orderService.setRole(next);
    Alert.alert("Роль изменена", `Вы вошли как ${next === 'employer' ? 'Работодатель' : 'Мастер'}`);
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", onPress: () => auth.signOut(), style: "destructive" }
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onLongPress={toggle} delayLongPress={800}>
          <View style={[styles.avatar, { borderColor: role === 'employer' ? COLORS.secondary : COLORS.primary, borderWidth: 3 }]}>
            <Ionicons name="person" size={50} color="#ccc" />
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>Иван Иванов</Text>
        <Text style={{color: COLORS.gray}}>{role === 'employer' ? 'РАБОТОДАТЕЛЬ' : 'МАСТЕР'}</Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={toggle}>
        <Text>Сменить роль</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={handleLogout}>
        <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { alignItems: 'center', padding: 40, backgroundColor: '#fff' },
  avatar: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  name: { fontSize: 20, fontWeight: 'bold', marginTop: 10 },
  btn: { margin: 20, padding: 15, backgroundColor: '#fff', borderRadius: 15, alignItems: 'center' }
});
export default ProfileScreen;