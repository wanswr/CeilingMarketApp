import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react'
import { apiService } from '../../services/ApiService';
import { audioRecorder } from '../../services/AudioRecorder';
import {
  AssistantNote,
  AssistantNoteAttachment,
  AssistantNoteTranscriptionStatus,
} from '../../types/assistant';

interface Props {
  route: {
    params: {
      id: string;
    };
  };
  navigation: any;
}

export const AssistantNoteDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id } = route.params;
  const [note, setNote] = useState<AssistantNote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());

  const fetchNote = async () => {
    try {
      const data = await apiService.getAssistantNote(id);
      setNote(data);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.response?.data?.message || 'Не удалось загрузить заметку');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNote();
  }, [id]);

  const handleStartRecording = async () => {
    try {
      await audioRecorder.startRecording();
      setIsRecording(true);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось начать запись');
    }
  };

  const handleStopRecording = async () => {
    try {
      const result = await audioRecorder.stopRecording();
      setIsRecording(false);
      setLoading(true);

      const updatedNote = await apiService.uploadNoteAudio(id, result.uri, result.durationMs);
      setNote(updatedNote);
    } catch (error: any) {
      setIsRecording(false);
      Alert.alert('Ошибка', error?.response?.data?.message || 'Не удалось сохранить аудиозапись');
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async (attachmentId: string) => {
    try {
      setTranscribingIds((prev) => new Set(prev).add(attachmentId));
      const updatedNote = await apiService.transcribeNoteAudio(id, attachmentId);
      setNote(updatedNote);
    } catch (error: any) {
      Alert.alert(
        'Ошибка расшифровки',
        error?.response?.data?.message || 'Не удалось выполнить расшифровку',
      );
      await fetchNote();
    } finally {
      setTranscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(attachmentId);
        return next;
      });
    }
  };

  const handleTogglePlay = async (attachment: AssistantNoteAttachment) => {
    if (isPlaying === attachment.id) {
      await audioRecorder.stopAudio();
      setIsPlaying(null);
    } else {
      try {
        setIsPlaying(attachment.id);
        await audioRecorder.playAudio(attachment.fileUrl, (status) => {
          if (status.didJustFinish) {
            setIsPlaying(null);
          }
        });
      } catch (error) {
        setIsPlaying(null);
        Alert.alert('Ошибка', 'Не удалось воспроизвести файл');
      }
    }
  };

  const handleArchive = async () => {
    Alert.alert('Архивация', 'Вы уверены, что хотите перенести заметку в архив?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'В архив',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.archiveAssistantNote(id);
            navigation.goBack();
          } catch (error: any) {
            Alert.alert('Ошибка', 'Не удалось отправить заметку в архив');
          }
        },
      },
    ]);
  };

  if (loading && !note) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Заметка не найдена</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.statusBadge}>{note.status}</Text>
      </View>

      {note.rawText ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Заметка:</Text>
          <Text style={styles.rawText}>{note.rawText}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Голосовые записи:</Text>
        {note.attachments && note.attachments.length > 0 ? (
          note.attachments.map((attachment, index) => {
            const isTranscribing = transcribingIds.has(attachment.id);
            const status = attachment.transcriptionStatus;

            return (
              <View key={attachment.id} style={styles.attachmentCard}>
                <View style={styles.audioRow}>
                  <TouchableOpacity
                    style={styles.playButton}
                    onPress={() => handleTogglePlay(attachment)}
                  >
                    <Text style={styles.playButtonText}>
                      {isPlaying === attachment.id ? '⏸ Пауза' : '▶ Воспроизвести'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.audioMeta}>
                    Запись #{index + 1}
                    {attachment.durationMs
                      ? ` (${Math.round(attachment.durationMs / 1000)} сек)`
                      : ''}
                  </Text>
                </View>

                {/* Transcription Section */}
                <View style={styles.transcriptionContainer}>
                  {status === AssistantNoteTranscriptionStatus.COMPLETED &&
                  attachment.transcriptionText ? (
                    <View style={styles.transcriptionBox}>
                      <Text style={styles.transcriptionLabel}>Распознанный текст:</Text>
                      <Text style={styles.transcriptionText}>{attachment.transcriptionText}</Text>
                    </View>
                  ) : status === AssistantNoteTranscriptionStatus.PROCESSING || isTranscribing ? (
                    <View style={styles.statusRow}>
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text style={styles.statusText}>Расшифровываю…</Text>
                    </View>
                  ) : status === AssistantNoteTranscriptionStatus.FAILED ? (
                    <View style={styles.failedBox}>
                      <Text style={styles.failedText}>Не удалось распознать запись</Text>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => handleTranscribe(attachment.id)}
                      >
                        <Text style={styles.retryButtonText}>Повторить</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusText}>Ожидает расшифровки</Text>
                      <TouchableOpacity
                        style={styles.transcribeButton}
                        onPress={() => handleTranscribe(attachment.id)}
                      >
                        <Text style={styles.transcribeButtonText}>Расшифровать</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>Нет прикрепленных аудиозаписей</Text>
        )}
      </View>

      <View style={styles.recordingSection}>
        {isRecording ? (
          <TouchableOpacity style={styles.stopRecordButton} onPress={handleStopRecording}>
            <Text style={styles.recordButtonText}>⏹ Остановить запись</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.startRecordButton} onPress={handleStartRecording}>
            <Text style={styles.recordButtonText}>🎙 Добавить голосовую запись</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.archiveButton} onPress={handleArchive}>
          <Text style={styles.archiveButtonText}>Архивировать</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  content: { padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#FF3B30' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    backgroundColor: '#E5F1FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#3A3A3C', marginBottom: 8 },
  rawText: {
    fontSize: 15,
    color: '#2C2C2E',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  attachmentCard: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  audioRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  playButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 10,
  },
  playButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  audioMeta: { fontSize: 13, color: '#8E8E93' },
  transcriptionContainer: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  transcriptionBox: { backgroundColor: '#F8F9FA', padding: 8, borderRadius: 6 },
  transcriptionLabel: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 4 },
  transcriptionText: { fontSize: 14, color: '#1C1C1E' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { fontSize: 13, color: '#8E8E93', marginRight: 8 },
  transcribeButton: { backgroundColor: '#34C759', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  transcribeButtonText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  failedBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  failedText: { fontSize: 13, color: '#FF3B30' },
  retryButton: { backgroundColor: '#FF9500', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  retryButtonText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  emptyText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic' },
  recordingSection: { marginVertical: 16 },
  startRecordButton: {
    backgroundColor: '#34C759',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  stopRecordButton: {
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  recordButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  actionRow: { marginTop: 10 },
  archiveButton: {
    backgroundColor: '#8E8E93',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  archiveButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
