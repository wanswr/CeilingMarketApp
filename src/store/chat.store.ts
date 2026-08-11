import { create } from 'zustand';

interface ChatState {
  chats: any[];
  messagesByChatId: Record<string, any[]>;
  setChats: (chats: any[]) => void;
  setMessages: (chatId: string, messages: any[]) => void;
  addMessage: (chatId: string, message: any) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messagesByChatId: {},
  setChats: (chats) => set({ chats }),
  setMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChatId: { ...state.messagesByChatId, [chatId]: messages },
    })),
  addMessage: (chatId, message) =>
    set((state) => {
      const messages = state.messagesByChatId[chatId] || [];
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: [...messages, message],
        },
      };
    }),
}));
