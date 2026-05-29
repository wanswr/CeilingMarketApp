import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';

const ProfileScreen = () => {
  const [role, setRole] = useState(orderService.getCurrentRole());
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    const sync = (r: any) => setRole(r);
    orderService.on('roleChanged', sync);
    return () => { orderService.off('roleChanged', sync); };
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
    }
  };

  const toggle = () => {
    const next = role === 'employer' ? 'worker' : 'employer';
    orderService.setRole(next);
    Alert.alert("Роль изменена", `Вы вошли как ${next === 'employer' ? 'Работодатель' : 'Мастер'}`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pickImage} onLongPress={toggle} delayLongPress={800}>
          <View style={[styles.avatar, { borderColor: role === 'employer' ? COLORS.secondary : COLORS.primary, borderWidth: 3 }]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={50} color="#ccc" />
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>Иван Иванов</Text>
        <Text style={{color: COLORS.gray}}>{role === 'employer' ? 'РАБОТОДАТЕЛЬ' : 'МАСТЕР'}</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.btn} onPress={toggle}>
          <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} style={{marginRight: 10}} />
          <Text style={styles.btnText}>Сменить роль</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={() => Alert.alert("В разработке")}>
          <Ionicons name="settings-outline" size={20} color={COLORS.gray} style={{marginRight: 10}} />
          <Text style={styles.btnText}>Настройки профиля</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { alignItems: 'center', padding: 40, backgroundColor: '#fff', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
  avatar: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', position: 'relative', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  editBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: COLORS.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  name: { fontSize: 22, fontWeight: 'bold', marginTop: 15 },
  content: { padding: 20 },
  btn: { flexDirection: 'row', padding: 18, backgroundColor: '#fff', borderRadius: 15, alignItems: 'center', marginBottom: 10, elevation: 1 },
  btnText: { fontSize: 16, fontWeight: '600' }
});

export default ProfileScreen;
