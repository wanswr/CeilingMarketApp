import React, { useState, useRef, useEffect } from 'react';

import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  ActivityIndicator
 } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../constants/theme'
import { socketService } from '../services/SocketService'
import { apiService } from '../services/ApiService'
import { mapEngine } from '../services/MapEngine'

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
  isRead: boolean;
}

const ChatDetailScreen = ({ route, navigation }: any) => {
  const { name, chatId, orderId, executorId } = route.params || {};
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [activeChatId, setActiveChatId] = useState(chatId);
  const flatListRef = useRef<FlatList>(null);
  const currentUser = mapEngine.getCurrentUser();
  const myId = currentUser?.id || currentUser?.uid;

  const markAsRead = async (id: string) => {
      try {
          await apiService.markChatAsRead(id);
      } catch (e) {}
  };

  useEffect(() => {
    const initChat = async () => {
      try {
        let currentChatId = activeChatId;
        if (!currentChatId && orderId && executorId) {
          const res = await apiService.getOrCreateChat(orderId, executorId);
          currentChatId = res.data.id;
          setActiveChatId(currentChatId);
          setMessages(res.data.messages || []);
        } else if (currentChatId) {
          const res = await apiService.getChatMessages(currentChatId);
          setMessages(res.data);
        }

        if (currentChatId) {
            markAsRead(currentChatId);
            const socket = socketService.getSocket();
            if (socket) {
                socket.emit('chat.join', currentChatId);

                // Task #4: Handle socket reconnect to re-join the room
                socket.on('connect', () => {
                    socket.emit('chat.join', currentChatId);
                });
            }
        }
      } catch (e) {
        console.error('Chat init error:', e);
      } finally {
        setLoading(false);
      }
    };

    initChat();

    const socket = socketService.getSocket();

    const onNewMessage = (msg: any) => {
        if (msg.chatId === activeChatId) {
            setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
            if (msg.senderId !== myId) {
                markAsRead(activeChatId);
            }
        }
    };

    const onMessagesRead = (payload: any) => {
        if (payload.chatId === activeChatId) {
            setMessages(prev => prev.map(m => m.senderId === myId ? { ...m, isRead: true } : m));
        }
    };

    if (socket) {
        socket.on('message.new', onNewMessage);
        socket.on('message.read', onMessagesRead);
    }

    return () => {
        if (socket) {
            socket.off('message.new', onNewMessage);
            socket.off('message.read', onMessagesRead);
            socket.off('connect'); // Remove the rejoin listener
            if (activeChatId) socket.emit('chat.leave', activeChatId);
        }
    };
  }, [chatId, activeChatId]);

  const sendMessage = async () => {
    if (inputText.trim() === '' || !activeChatId) return;

    const textToSend = inputText;
    setInputText('');

    try {
        await apiService.sendMessage(activeChatId, textToSend);
    } catch (e) {
        console.error('Send error:', e);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === myId;
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <View style={styles.messageFooter}>
            <Text style={styles.timestamp}>{time}</Text>
            {isMe && <Ionicons name={item.isRead ? "checkmark-done" : "checkmark"} size={16} color={item.isRead ? "#34B7F1" : "#A7E5FF"} style={{marginLeft: 4}} />}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e5ddd5' }} edges={['bottom']}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Чат'}</Text>
          </View>
      </View>

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <ImageBackground source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }} style={styles.background}>
          {loading ? (
              <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          ) : (
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listPadding}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                onLayout={() => flatListRef.current?.scrollToEnd()}
            />
          )}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.iconBtn}><Ionicons name="add" size={28} color={COLORS.primary} /></TouchableOpacity>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Cообщение..."
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
            </View>
            <TouchableOpacity
                style={[styles.sendBtn, !inputText.trim() && { backgroundColor: COLORS.gray }]}
                onPress={sendMessage}
                disabled={!inputText.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
      height: 60,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      paddingHorizontal: 15,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0'
  },
  backBtn: { padding: 5 },
  headerTitleContainer: { marginLeft: 15, flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  background: { flex: 1 },
  listPadding: { padding: 10, paddingBottom: 20 },
  messageWrapper: { marginBottom: 4, maxWidth: '85%' },
  myMessageWrapper: { alignSelf: 'flex-end' },
  otherMessageWrapper: { alignSelf: 'flex-start' },
  messageBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, ...SHADOWS.soft },
  myBubble: { backgroundColor: '#DCF8C6', borderTopRightRadius: 4 },
  otherBubble: { backgroundColor: '#fff', borderTopLeftRadius: 4 },
  messageText: { fontSize: 16, color: COLORS.dark },
  messageFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 11, color: '#888' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#f0f0f0' },
  inputWrapper: { flex: 1, backgroundColor: '#fff', borderRadius: 25, marginHorizontal: 8, paddingHorizontal: 15, minHeight: 40, justifyContent: 'center' },
  input: { fontSize: 16, paddingTop: 8, paddingBottom: 8, color: COLORS.dark },
  sendBtn: { backgroundColor: COLORS.primary, width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', ...SHADOWS.soft },
  iconBtn: { paddingBottom: 8 }
});

export default ChatDetailScreen;
