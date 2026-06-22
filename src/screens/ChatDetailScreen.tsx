import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { socketService } from '../services/SocketService';
import { apiService } from '../services/ApiService';
import { mapEngine } from '../services/MapEngine';

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

const ChatDetailScreen = ({ route }: any) => {
  const { name, chatId, orderId, executorId } = route.params || {};
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [activeChatId, setActiveChatId] = useState(chatId);
  const flatListRef = useRef<FlatList>(null);
  const currentUser = mapEngine.getCurrentUser();
  const myId = currentUser?.id || currentUser?.uid;

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
          setMessages(res.data);
        }
      } catch (e) {
        console.error('Chat init error:', e);
      } finally {
        setLoading(false);
      }
    };

    initChat();

    // Socket listeners
    const onNewMessage = (msg: any) => {
        if (msg.chatId === activeChatId) {
            setMessages(prev => [...prev, msg]);
        }
    };

    const socket = (socketService as any).socket;
    if (socket) {
        socket.on('message.new', onNewMessage);
        if (activeChatId) socket.emit('chat.join', activeChatId);
    }

    return () => {
        if (socket) {
            socket.off('message.new', onNewMessage);
            if (activeChatId) socket.emit('chat.leave', activeChatId);
        }
    };
  }, [chatId, activeChatId]);

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
    const isMe = item.senderId === 'me';
    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <View style={styles.messageFooter}>
            <Text style={styles.timestamp}>{item.timestamp}</Text>
            {isMe && <Ionicons name={item.status === 'read' ? "checkmark-done" : "checkmark"} size={16} color="#A7E5FF" style={{marginLeft: 4}} />}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e5ddd5' }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ImageBackground source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }} style={styles.background}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listPadding}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          />
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.iconBtn}><Ionicons name="attach" size={26} color={COLORS.gray} /></TouchableOpacity>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder="Сообщение" value={inputText} onChangeText={setInputText} multiline />
            </View>
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Ionicons name={inputText.length > 0 ? "send" : "mic"} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1 },
  listPadding: { padding: 10 },
  messageWrapper: { marginBottom: 4, maxWidth: '80%' },
  myMessageWrapper: { alignSelf: 'flex-end' },
  otherMessageWrapper: { alignSelf: 'flex-start' },
  senderName: { fontSize: 12, fontWeight: 'bold', color: COLORS.secondary, marginLeft: 10, marginBottom: 2 },
  messageBubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  myBubble: { backgroundColor: '#DCF8C6', borderTopRightRadius: 2 },
  otherBubble: { backgroundColor: '#fff', borderTopLeftRadius: 2 },
  messageText: { fontSize: 16 },
  messageFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 11, color: '#66bb6a' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 8 },
  inputWrapper: { flex: 1, backgroundColor: '#fff', borderRadius: 25, marginHorizontal: 5, paddingHorizontal: 12, minHeight: 40 },
  input: { flex: 1, fontSize: 16, paddingTop: 8, paddingBottom: 8 },
  sendBtn: { backgroundColor: '#0088cc', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  iconBtn: { padding: 8 }
});

export default ChatDetailScreen;