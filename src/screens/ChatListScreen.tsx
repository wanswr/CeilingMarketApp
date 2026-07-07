import React, { useState, useEffect } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../constants/theme'
import { apiService } from '../services/ApiService'
import { socketService } from '../services/SocketService'
import { mapEngine } from '../services/MapEngine'

const ChatListScreen = ({ navigation }: any) => {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentUser = mapEngine.getCurrentUser();
  const myId = currentUser?.id || currentUser?.uid;

  const fetchChats = async () => {
    try {
      const res = await apiService.getMyChats();
      setChats(res.data);
    } catch (e) {
      console.error('Fetch chats error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChats();

    const socket = (socketService as any).socket;
    if (socket) {
        socket.on('chat.update', fetchChats);
        socket.on('message.new', fetchChats);
        socket.on('message.read', fetchChats);
    }

    return () => {
        if (socket) {
            socket.off('chat.update', fetchChats);
            socket.off('message.new', fetchChats);
            socket.off('message.read', fetchChats);
        }
    };
  }, []);

  const renderChatItem = ({ item }: { item: any }) => {
    const isEmployer = item.employerId === myId;
    const partner = isEmployer ? item.executor : item.employer;
    const lastMsg = item.messages?.[0];

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('ChatDetail', {
            chatId: item.id,
            name: partner?.name || 'Пользователь'
        })}
      >
        <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.avatarText}>{(partner?.name || '?')[0]}</Text>
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>{item.order?.title || 'Чат по заказу'}</Text>
            {lastMsg && <Text style={styles.chatTime}>{new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
          </View>
          <View style={styles.lastMsgRow}>
            <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.unreadText]} numberOfLines={1}>
                {lastMsg ? (lastMsg.senderId === myId ? 'Вы: ' : '') + lastMsg.text : 'Нет сообщений'}
            </Text>
            {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                    <Text style={styles.unreadCountText}>{item.unreadCount}</Text>
                </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
      return (
          <View style={styles.center}>
              <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
      )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.gray} />
        <TextInput placeholder="Поиск чатов..." style={styles.searchInput} />
      </View>
      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={renderChatItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChats(); }} />}
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color={COLORS.border} />
                <Text style={styles.emptyText}>У вас пока нет активных чатов</Text>
            </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', margin: 10, paddingHorizontal: 10, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, marginLeft: 10 },
  chatItem: { flexDirection: 'row', padding: 15, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatar: { width: 55, height: 55, borderRadius: 27.5, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  chatInfo: { flex: 1, marginLeft: 15 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 5 },
  chatTime: { fontSize: 12, color: COLORS.gray },
  lastMsgRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  lastMessage: { fontSize: 14, color: COLORS.gray, flex: 1 },
  unreadText: { color: COLORS.dark, fontWeight: '600' },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadCountText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 100, padding: 40 },
  emptyText: { marginTop: 20, fontSize: 16, color: COLORS.gray, textAlign: 'center' }
});

export default ChatListScreen;
