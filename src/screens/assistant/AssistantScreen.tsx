import { AssistantMascot } from '../../components/assistant/AssistantMascot';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { apiService } from '../../services/ApiService';
import { AssistantNote, AssistantReminder } from '../../types/assistant';

interface Props {
  navigation: any;
}

export const AssistantScreen: React.FC<Props> = ({ navigation }) => {
  const [notes, setNotes] = useState<AssistantNote[]>([]);
  const [reminders, setReminders] = useState<AssistantReminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      const [notesData, remindersData] = await Promise.all([
        apiService.getAssistantNotes(),
        apiService.getReminders(),
      ]);
      setNotes(notesData);
      setReminders(
        (remindersData || [])
          .filter((r) => r.status === 'SCHEDULED')
          .slice(0, 5),
      );
    } catch (error: any) {
      Alert.alert('Ошибка', error?.response?.data?.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const renderNoteItem = ({ item }: { item: AssistantNote }) => (
    <TouchableOpacity
      style={styles.noteCard}
      onPress={() => navigation.navigate('AssistantNoteDetail', { id: item.id })}
    >
      <View style={styles.noteHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.noteStatus}>{item.status}</Text>
      </View>
      <Text style={styles.noteDate}>
        {new Date(item.createdAt).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      {item.rawText ? (
        <Text style={styles.noteText} numberOfLines={2}>
          {item.rawText}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  const renderReminderItem = ({ item }: { item: AssistantReminder }) => (
    <TouchableOpacity
      style={styles.reminderCard}
      onPress={() => {
        if (item.noteId) {
          navigation.navigate('AssistantNoteDetail', { id: item.noteId });
        }
      }}
    >
      <View style={styles.reminderHeader}>
        <Text style={styles.reminderTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.reminderBadge}>SCHEDULED</Text>
      </View>
      <Text style={styles.reminderTime}>
        ⏰ {new Date(item.scheduledAt).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <View style={styles.assistantHeaderRow}>
        <View style={styles.mascotTitleRow}>
          <AssistantMascot state="idle" size={38} />
          <Text style={styles.headerSubtitleText}>Что нужно зафиксировать?</Text>
        </View>
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => navigation.navigate('AssistantOnboarding')}
        >
          <Text style={styles.helpButtonText}>Что умеет Ассистент?</Text>
        </TouchableOpacity>
      </View>

<View style={styles.topActions}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('AssistantNoteEditor')}
        >
          <Text style={styles.createButtonText}>+ Новая заметка</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Reminders Section */}
        {reminders && reminders.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ближайшие напоминания</Text>
            {reminders.map((reminder) => (
              <View key={reminder.id}>{renderReminderItem({ item: reminder })}</View>
            ))}
          </View>
        ) : null}

        {/* Notes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Все заметки</Text>
          {notes && notes.length > 0 ? (
            notes.map((note) => <View key={note.id}>{renderNoteItem({ item: note })}</View>)
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>У вас пока нет заметок</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  scrollContent: { padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topActions: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  noteCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', flex: 1 },
  noteStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007AFF',
    backgroundColor: '#E5F1FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noteDate: { fontSize: 12, color: '#8E8E93', marginBottom: 6 },
  noteText: { fontSize: 14, color: '#3A3A3C' },
  reminderCard: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderTitle: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', flex: 1 },
  reminderBadge: { fontSize: 11, fontWeight: '600', color: '#34C759' },
  reminderTime: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#8E8E93' },

  assistantHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFF',
  },
  mascotTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerSubtitleText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginLeft: 10 },
  helpButton: { backgroundColor: '#E5F1FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  helpButtonText: { fontSize: 12, fontWeight: '600', color: '#007AFF' },

});