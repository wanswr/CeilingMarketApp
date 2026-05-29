import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { COLORS } from '../constants/theme';

const RegisterDetailsScreen = ({ navigation }: any) => {
  const [fio, setFio] = useState('');
  const [date, setDate] = useState('');
  const [image, setImage] = useState<string | null>(null);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ваши данные</Text>

      <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="camera" size={32} color={COLORS.gray} />
            <Text style={styles.avatarText}>Добавить фото</Text>
          </View>
        )}
      </TouchableOpacity>

      <TextInput style={styles.input} placeholder="ФИО" value={fio} onChangeText={setFio} />
      <TextInput style={styles.input} placeholder="Дата рождения" value={date} onChangeText={setDate} />
      <Button title="Далее" onPress={() => navigation.navigate('RoleSelection')} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 12, color: COLORS.gray, marginTop: 5 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 15 }
});

export default RegisterDetailsScreen;
