import React, { useState, useEffect } from 'react';

import { TouchableOpacity, View,
 Text,
 StyleSheet,
 FlatList,

 ActivityIndicator,
 Share,
 Alert } from 'react-native';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export default function InviteFriendsScreen() {
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers] });

        if (data.length > 0) {
          const filtered = data
            .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setContacts(filtered);
        }
      } else {
        setError('Доступ к контактам запрещен');
      }
      setLoading(false);
    })();
  }, []);

  const handleInvite = async (contact: Contacts.Contact) => {
    try {
      await Share.share({
        message: `Привет! Попробуй приложение CeilingsApp для поиска заказов и мастеров по натяжным потолкам: https://ceilingsapp.example.com` });
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Ionicons name="lock-closed" size={64} color={COLORS.gray} />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => Contacts.requestPermissionsAsync()}
      >
        <Text style={styles.retryText}>Разрешить доступ</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Пригласите коллег и знакомых присоединиться к CeilingsApp</Text>
      </View>
      <FlatList
        data={contacts}
        keyExtractor={(item, index) => ((item as any).id || index.toString())}
        renderItem={({ item }) => (
          <View style={styles.contactItem}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phoneNumbers?.[0]?.number || 'Нет номера'}</Text>
            </View>
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => handleInvite(item)}
            >
              <Text style={styles.inviteBtnText}>Пригласить</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Контакты не найдены</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { padding: 20, backgroundColor: COLORS.bgLight },
  headerSubtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center' },
  errorText: { marginTop: 20, fontSize: 16, color: COLORS.gray, textAlign: 'center' },
  retryBtn: { marginTop: 20, backgroundColor: COLORS.primary, padding: 15, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: 'bold' },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLight
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  info: { flex: 1, marginLeft: 15 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  phone: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  inviteBtn: { backgroundColor: COLORS.bgLight, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  inviteBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: COLORS.gray } });
