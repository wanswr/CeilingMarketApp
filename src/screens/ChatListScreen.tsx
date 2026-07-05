import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, FlatList, TextInput } from 'react-native';
import { TouchableOpacity, Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, COLORS } from '../constants/theme';

const ChatListScreen = ({ navigation }: any) => {
  const [chats] = useState([
    { id: '1', name: 'Монтаж на Ленина 5', lastMessage: 'Иван: Потолок готов', time: '12:45', unreadCount: 2, type: 'group' },
    { id: '2', name: 'Александр (Замерщик)', lastMessage: 'Вы: Скинул размеры', time: '11:20', unreadCount: 0, type: 'direct' },
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.gray} />
        <TextInput placeholder="Поиск чатов..." style={styles.searchInput} />
      </View>
      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.chatItem} onPress={() => navigation.navigate('ChatDetail', { name: item.name })}>
            <View style={[styles.avatar, { backgroundColor: item.type === 'group' ? COLORS.secondary : COLORS.primary }]}>
              <Ionicons name={item.type === 'group' ? "people" : "person"} size={24} color="#fff" />
            </View>
            <View style={styles.chatInfo}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatName}>{item.name}</Text>
                <Text style={styles.chatTime}>{item.time}</Text>
              </View>
              <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', margin: 10, paddingHorizontal: 10, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, marginLeft: 10 },
  chatItem: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  avatar: { width: 55, height: 55, borderRadius: 27.5, justifyContent: 'center', alignItems: 'center' },
  chatInfo: { flex: 1, marginLeft: 15 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  chatName: { fontSize: 17, fontWeight: '600' },
  chatTime: { fontSize: 13, color: COLORS.gray },
  lastMessage: { fontSize: 15, color: COLORS.gray, marginTop: 2 }
});

export default ChatListScreen;