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
  status?: 'sent' | 'delivered' | 'read';
}

const formatTime = (dateInput: any): string => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const ChatDetailScreen = ({ route, navigation }: any) => {
  const { name, chatId, orderId, executorId } = route.params || {};
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [activeChatId, setActiveChatId] = useState(chatId);
  const flatListRef = useRef<FlatList>(null);
  
  const currentUser = mapEngine.getCurrentUser();
  const myId = currentUser?.id || currentUser?.uid;

  // Ref to track which room we are currently joined to
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const initChat = async () => {
      try {
        let currentChatId = chatId;
        if (!currentChatId && orderId && executorId) {
          // @ts-ignore
          const res = await apiService.getOrCreateChat(orderId, executorId);
          currentChatId = res.data.id;
          setActiveChatId(currentChatId);
          setMessages(res.data.messages || []);
        } else if (currentChatId) {
          // @ts-ignore
          const res = await apiService.getChatMessages(currentChatId);
          setMessages(res.data || []);
        }
      } catch (e) {
        console.error('Chat init error:', e);
      } finally {
        setLoading(false);
      }
    };

    initChat();
  }, [chatId, orderId, executorId]);

  useEffect(() => {
    if (!activeChatId) return;

    const onNewMessage = (msg: any) => {
      if (msg.chatId === activeChatId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const socket = (socketService as any).socket;
    if (socket) {
      socket.on('message.new', onNewMessage);
      
      // De-duplicate join: only emit join if room changed
      if (joinedRoomRef.current !== activeChatId) {
        if (joinedRoomRef.current) {
          socket.emit('chat.leave', joinedRoomRef.current);
        }
        socket.emit('chat.join', activeChatId);
        joinedRoomRef.current = activeChatId;
      }
    }

    return () => {
      if (socket) {
        socket.off('message.new', onNewMessage);
        if (joinedRoomRef.current) {
          socket.emit('chat.leave', joinedRoomRef.current);
          joinedRoomRef.current = null;
        }
      }
    };
  }, [activeChatId]);

  const sendMessage = async () => {
    if (inputText.trim() === '' || !activeChatId) return;

    const textToSend = inputText;
    setInputText('');

    try {
      // @ts-ignore
      await apiService.sendMessage(activeChatId, textToSend);
    } catch (e) {
      console.error('Send error:', e);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === myId;
    const senderName = (item as any).sender?.name || item.senderName || 'Собеседник';
    const messageTime = formatTime(item.createdAt);

    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessageContainer : styles.otherMessageContainer]}>
        <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
          {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
          <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
            <Text style={styles.messageText}>{item.text}</Text>
            <View style={styles.messageFooter}>
              <Text style={styles.timestamp}>{messageTime}</Text>
              {isMe && (
                <Ionicons
                  name={item.status === 'read' ? "checkmark-done" : "checkmark"}
                  size={16}
                  color={item.status === 'read' ? "#34B7F1" : COLORS.placeholder}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e5ddd5' }} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Чат'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ImageBackground
          source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
          style={styles.background}
        >
          {loading ? (
            <View style={[styles.container, styles.center]}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listPadding}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="attach" size={26} color={COLORS.gray} />
            </TouchableOpacity>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Сообщение"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: inputText.trim().length > 0 ? COLORS.primary : COLORS.gray }]}
              onPress={sendMessage}
              disabled={inputText.trim().length === 0}
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
  center: { justifyContent: 'center', alignItems: 'center' },
  background: { flex: 1 },
  header: {
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.dark, flex: 1, textAlign: 'center', marginHorizontal: 10 },
  listPadding: { padding: 10, paddingBottom: 20 },
  messageContainer: { width: '100%', marginBottom: 8 },
  myMessageContainer: { alignItems: 'flex-end' },
  otherMessageContainer: { alignItems: 'flex-start' },
  messageWrapper: { maxWidth: '80%' },
  myMessageWrapper: { alignItems: 'flex-end' },
  otherMessageWrapper: { alignItems: 'flex-start' },
  senderName: { fontSize: 11, fontWeight: '700', color: COLORS.secondary, marginLeft: 8, marginBottom: 2 },
  messageBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  myBubble: { backgroundColor: '#DCF8C6', borderTopRightRadius: 2 },
  otherBubble: { backgroundColor: '#fff', borderTopLeftRadius: 2 },
  messageText: { fontSize: 16, color: COLORS.dark },
  messageFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  timestamp: { fontSize: 10, color: COLORS.gray },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, backgroundColor: '#f6f6f6' },
  inputWrapper: { flex: 1, backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 40, maxHeight: 100, justifyContent: 'center' },
  input: { fontSize: 16, paddingTop: 8, paddingBottom: 8, color: COLORS.dark },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  iconBtn: { padding: 6, justifyContent: 'center', alignItems: 'center' }
});

export default ChatDetailScreen;
