import { maskPhoneNumbers } from '../utils/security';
import AppIcon from '../components/AppIcon';
import React, { useState, useRef, useEffect } from 'react';
import * as Crypto from 'expo-crypto';
import { logger } from '../services/logger/LoggerService';

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
import { COLORS, SHADOWS } from '../constants/theme'
import { socketService } from '../services/SocketService'
import { apiService } from '../services/ApiService'
import { mapEngine } from '../services/MapEngine'

interface Message {
  id: string;
  clientMessageId?: string;
  text: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
  isRead: boolean;
  pending?: boolean;
  failed?: boolean;
  hasContacts?: boolean;
}

const ChatDetailScreen = ({ route, navigation }: any) => {
  const { name, chatId, orderId, executorId } = route.params || {};
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
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
    const onNewMessage = (msg: any) => {
        if (msg.chatId === activeChatId) {
            setMessages(prev => {
                if (prev.some(m => m.id === msg.id || (msg.clientMessageId && m.clientMessageId === msg.clientMessageId))) {
                    return prev.map(m => (msg.clientMessageId && m.clientMessageId === msg.clientMessageId) || m.id === msg.id ? { ...msg, pending: false, failed: false } : m);
                }
                if (msg.senderId === myId) {
                    const pendingIdx = prev.findIndex(m => m.pending && m.text === msg.text);
                    if (pendingIdx !== -1) {
                        const updated = [...prev];
                        updated[pendingIdx] = { ...msg, pending: false, failed: false };
                        return updated;
                    }
                }
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

    const handleReconnect = () => {
        const socket = socketService.getSocket();
        if (socket && activeChatId) {
            socket.emit('chat.join', activeChatId);
        }
    };

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
          const msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
          const cursor = res.data?.nextCursor || null;
          setMessages(msgs);
          setNextCursor(cursor);
        }

        if (currentChatId) {
            markAsRead(currentChatId);
            const socket = socketService.getSocket();
            if (socket) {
                socket.emit('chat.join', currentChatId);
            }
        }
      } catch (e) {
        logger.error("UI_ERROR", { error: 'Chat init error:', e });
      } finally {
        setLoading(false);
      }
    };

    initChat();

    socketService.on('message.new', onNewMessage);
    socketService.on('message.read', onMessagesRead);
    socketService.on('connect', handleReconnect);

    return () => {
        socketService.off('message.new', onNewMessage);
        socketService.off('message.read', onMessagesRead);
        socketService.off('connect', handleReconnect);

        const socket = socketService.getSocket();
        if (socket && activeChatId) {
            socket.emit('chat.leave', activeChatId);
        }
    };
  }, [chatId, activeChatId]);

  const loadMoreMessages = async () => {
    if (loadingMore || !nextCursor || !activeChatId) return;
    setLoadingMore(true);
    try {
      const res = await apiService.getChatMessages(activeChatId, nextCursor);
      const newMessages = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
      const newCursor = res.data?.nextCursor || null;

      setMessages(prev => [...newMessages, ...prev]);
      setNextCursor(newCursor);
    } catch (e) {
      logger.error("UI_ERROR", { error: 'Load more messages error:', e });
    } finally {
      setLoadingMore(false);
    }
  };

  const retryMessage = async (msg: Message) => {
    if (!msg.failed || !activeChatId) return;

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pending: true, failed: false } : m));

    try {
        await apiService.sendMessage(activeChatId, msg.text, msg.clientMessageId);
    } catch (e) {
        logger.error("UI_ERROR", { error: 'Retry send error:', e });
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pending: false, failed: true } : m));
    }
  };

  const sendMessage = async () => {
    if (inputText.trim() === '' || !activeChatId) return;

    const textToSend = maskPhoneNumbers(inputText);
    setInputText('');

    const clientMessageId = Crypto.randomUUID();
    const tempMsg: Message = {
      id: clientMessageId,
      clientMessageId,
      text: textToSend,
      senderId: myId || 'me',
      createdAt: new Date().toISOString(),
      isRead: false,
      pending: true,
      failed: false
    };

    setMessages(prev => [...prev, tempMsg]);

    try {
        await apiService.sendMessage(activeChatId, textToSend, clientMessageId);
    } catch (e) {
        logger.error("UI_ERROR", { error: 'Send error:', e });
        setMessages(prev => prev.map(m => m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true } : m));
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === myId || item.senderId === currentUser?.id || item.senderId === currentUser?.uid;
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={{ flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', width: '100%' }}>
        <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
          <TouchableOpacity
            disabled={!item.failed}
            onPress={() => retryMessage(item)}
            activeOpacity={0.7}
            style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}
          >
            <Text style={styles.messageText}>{item.text}</Text>
            <View style={styles.messageFooter}>
              <Text style={styles.timestamp}>{time}</Text>
              {isMe && (
                item.failed ? (
                  <AppIcon name="status-warning" size={16} color={COLORS.danger} style={{ marginLeft: 4 }} />
                ) : item.pending ? (
                  <AppIcon name="status-pending" size={14} color="#888" style={{ marginLeft: 4 }} />
                ) : (
                  <AppIcon name={item.isRead ? "sys-read" : "sys-check"} size={16} color={item.isRead ? "#34B7F1" : "#A7E5FF"} style={{ marginLeft: 4 }} />
                )
              )}
            </View>
          </TouchableOpacity>
        </View>
        {item.hasContacts && (
          <View style={[
            styles.contactWarningContainer,
            isMe ? { marginRight: 20, alignSelf: 'flex-end' } : { marginLeft: 20, alignSelf: 'flex-start' }
          ]}>
            <AppIcon name="status-warning" size={13} color="#D97706" style={{ marginRight: 4 }} />
            <Text style={styles.contactWarningText}>
              Внимание! Передача контактов вне платформы лишает вас защиты сделки и снижает рейтинг доверия.
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e5ddd5' }} edges={['bottom']}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <AppIcon name="nav-back" size={24} color={COLORS.dark} />
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
                keyExtractor={item => item.clientMessageId || item.id}
                contentContainerStyle={styles.listPadding}
                onContentSizeChange={(w, h) => {
                  if (!loadingMore) {
                    flatListRef.current?.scrollToEnd();
                  }
                }}
                onLayout={() => flatListRef.current?.scrollToEnd()}
                ListHeaderComponent={() => {
                  if (!nextCursor) return null;
                  return (
                    <TouchableOpacity onPress={loadMoreMessages} disabled={loadingMore} style={{ padding: 10, alignItems: 'center' }}>
                      {loadingMore ? (
                        <ActivityIndicator color={COLORS.primary} />
                      ) : (
                        <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Показать предыдущие сообщения</Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
            />
          )}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.iconBtn}><AppIcon name="tab-create" size={28} color={COLORS.primary} /></TouchableOpacity>
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
              <AppIcon name="action-send" size={20} color="#fff" />
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
  iconBtn: { paddingBottom: 8 },
  contactWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 2,
    marginBottom: 8,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  contactWarningText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  }
});

export default ChatDetailScreen;
