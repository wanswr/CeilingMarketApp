import React, { useState, useEffect, useCallback } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../constants/theme'
import { apiService } from '../services/ApiService'
import { socketService } from '../services/SocketService'
import { mapEngine } from '../services/MapEngine'

const formatTime = (dateInput: any): string => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const ChatListScreen = ({ navigation }: any) => {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isFocused = useIsFocused();

  const currentUser = mapEngine.getCurrentUser();
  const myId = currentUser?.id || currentUser?.uid;

  const fetchChats = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await apiService.getMyChats();
      const chatsData = res.data || [];
      setChats(chatsData);

      // Join socket rooms for all loaded chats
      const socket = (socketService as any).socket;
      if (socket) {
        chatsData.forEach((chat: any) => {
          socket.emit('chat.join', chat.id);
        });
      }
    } catch (e) {
      console.error('[ChatListScreen] fetchChats error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchChats(chats.length === 0);
    }
  }, [isFocused]);

  useEffect(() => {
    const socket = (socketService as any).socket;
    
    const onNewMessage = (msg: any) => {
      setChats(prevChats => {
        const chatIndex = prevChats.findIndex(c => c.id === msg.chatId);
        if (chatIndex === -1) {
          fetchChats(false);
          return prevChats;
        }

        const updatedChats = [...prevChats];
        const chat = { ...updatedChats[chatIndex] };
        
        chat.messages = [msg];
        chat.updatedAt = msg.createdAt;
        
        updatedChats[chatIndex] = chat;
        
        return updatedChats.sort((a, b) => {
          const tA = new Date(a.updatedAt || a.messages?.[0]?.createdAt || 0).getTime();
          const tB = new Date(b.updatedAt || b.messages?.[0]?.createdAt || 0).getTime();
          return tB - tA;
        });
      });
    };

    if (socket) {
      socket.on('message.new', onNewMessage);
    }

    return () => {
      if (socket) {
        socket.off('message.new', onNewMessage);
        chats.forEach((chat: any) => {
          socket.emit('chat.leave', chat.id);
        });
      }
    };
  }, [chats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChats(false);
  }, []);

  const filteredChats = chats.filter(chat => {
    const isEmployer = myId === chat.employerId;
    const otherUser = isEmployer ? chat.executor : chat.employer;
    const name = otherUser?.name || '';
    const title = chat.order?.title || '';
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (loading && chats.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.gray} />
        <TextInput
          placeholder="Поиск чатов..."
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredChats}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={COLORS.border} />
            <Text style={styles.emptyText}>У вас пока нет активных чатов</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isEmployer = myId === item.employerId;
          const otherUser = isEmployer ? item.executor : item.employer;
          const otherUserName = otherUser?.name || 'Пользователь';
          const orderTitle = item.order?.title || 'Заказ';
          const chatName = `${orderTitle} (${otherUserName})`;

          const lastMsg = item.messages?.[0];
          let lastMessageText = 'Нет сообщений';
          let timeDisplay = '';

          if (lastMsg) {
            const senderName = lastMsg.senderId === myId ? 'Вы' : (lastMsg.sender?.name || otherUserName);
            lastMessageText = `${senderName}: ${lastMsg.text}`;
            timeDisplay = formatTime(lastMsg.createdAt);
          }

          return (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() =>
                navigation.navigate('ChatDetail', {
                  chatId: item.id,
                  name: chatName,
                  orderId: item.orderId,
                  executorId: item.executorId
                })
              }
            >
              <View style={[styles.avatar, { backgroundColor: isEmployer ? COLORS.secondary : COLORS.primary }]}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text style={styles.chatName} numberOfLines={1}>{chatName}</Text>
                  <Text style={styles.chatTime}>{timeDisplay}</Text>
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>{lastMessageText}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', margin: 10, paddingHorizontal: 10, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, marginLeft: 10 },
  chatItem: { flexDirection: 'row', padding: 15, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  chatInfo: { flex: 1, marginLeft: 15 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { fontSize: 16, fontWeight: '600', color: COLORS.dark, flex: 1, marginRight: 10 },
  chatTime: { fontSize: 12, color: COLORS.gray },
  lastMessage: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { marginTop: 10, color: COLORS.gray, fontSize: 16, fontWeight: '500' }
});

export default ChatListScreen;
