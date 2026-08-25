import { buildOrderPrefillFromNote } from '../../utils/assistantOrderMapper';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { apiService } from '../../services/ApiService';
import { audioRecorder } from '../../services/AudioRecorder';
import { reminderNotificationService } from '../../services/ReminderNotificationService';
import {
  AssistantNote,
  AssistantNoteAttachment,
  AssistantNoteTranscriptionStatus,
  AssistantNoteAnalysisStatus,
  AssistantNoteStructuredOutput,
  AssistantNoteEditProposal,
  AssistantReminder,
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
  const [reminders, setReminders] = useState<AssistantReminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());

  // AI Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>('');
  const [proposing, setProposing] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [proposal, setProposal] = useState<AssistantNoteEditProposal | null>(null);

  // Reminder Modal State
  const [reminderModalVisible, setReminderModalVisible] = useState<boolean>(false);
  const [reminderTitle, setReminderTitle] = useState<string>('');
  const [reminderDateStr, setReminderDateStr] = useState<string>('');
  const [reminderTimeStr, setReminderTimeStr] = useState<string>('19:00');
  const [sourceTaskId, setSourceTaskId] = useState<string | undefined>(undefined);
  const [creatingReminder, setCreatingReminder] = useState<boolean>(false);

  const fetchNoteAndReminders = async () => {
    try {
      const [noteData, remindersData] = await Promise.all([
        apiService.getAssistantNote(id),
        apiService.getReminders(id),
      ]);
      setNote(noteData);
      setReminders(remindersData || []);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.response?.data?.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNoteAndReminders();
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
      await fetchNoteAndReminders();
    } finally {
      setTranscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(attachmentId);
        return next;
      });
    }
  };

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);
      const updatedNote = await apiService.analyzeAssistantNote(id);
      setNote(updatedNote);
    } catch (error: any) {
      Alert.alert(
        'Ошибка разбора',
        error?.response?.data?.message || 'Не удалось выполнить структурированный разбор заметки',
      );
      await fetchNoteAndReminders();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOpenReminderModal = (title: string, taskObj?: any) => {
    setReminderTitle(title);
    setSourceTaskId(taskObj?.id);

    // Default to tomorrow 19:00 if date not explicitly passed
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateFormatted = tomorrow.toISOString().split('T')[0];

    setReminderDateStr(dateFormatted);
    setReminderTimeStr('19:00');
    setReminderModalVisible(true);
  };

  const handleConfirmCreateReminder = async () => {
    if (!reminderTitle.trim() || !reminderDateStr.trim() || !reminderTimeStr.trim()) {
      Alert.alert('Предупреждение', 'Заполните название, дату и время');
      return;
    }

    const fullDateIsoStr = `${reminderDateStr.trim()}T${reminderTimeStr.trim()}:00`;
    const targetDate = new Date(fullDateIsoStr);

    if (isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
      Alert.alert('Ошибка даты', 'Время напоминания должно быть в будущем');
      return;
    }

    try {
      setCreatingReminder(true);

      // Request notification permission contextually
      const hasPermission = await reminderNotificationService.requestPermissions();

      // Create reminder on backend
      const reminder = await apiService.createReminder({
        title: reminderTitle.trim(),
        scheduledAt: targetDate.toISOString(),
        noteId: id,
        sourceTaskId,
      });

      // Schedule local notification if permission granted
      if (hasPermission) {
        const notificationId = await reminderNotificationService.scheduleNotification(
          reminder.title,
          'Напоминание от Ассистента',
          targetDate,
        );
        if (notificationId) {
          await apiService.updateReminder(reminder.id, { notificationId });
        }
      } else {
        Alert.alert(
          'Уведомления отключены',
          'Напоминание сохранено, но уведомления на устройстве отключены.',
        );
      }

      setReminderModalVisible(false);
      await fetchNoteAndReminders();
      Alert.alert('Успех', 'Напоминание успешно создано');
    } catch (error: any) {
      Alert.alert(
        'Ошибка создания',
        error?.response?.data?.message || 'Не удалось создать напоминание',
      );
    } finally {
      setCreatingReminder(false);
    }
  };

  const handleCompleteReminder = async (reminder: AssistantReminder) => {
    try {
      await apiService.completeReminder(reminder.id);
      await reminderNotificationService.cancelNotification(reminder.notificationId);
      await fetchNoteAndReminders();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось завершить напоминание');
    }
  };

  const handleCancelReminder = async (reminder: AssistantReminder) => {
    try {
      await apiService.cancelReminder(reminder.id);
      await reminderNotificationService.cancelNotification(reminder.notificationId);
      await fetchNoteAndReminders();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось отменить напоминание');
    }
  };

  const handleProposeEdit = async () => {
    if (!editText.trim()) {
      Alert.alert('Предупреждение', 'Введите текст изменений');
      return;
    }

    try {
      setProposing(true);
      const prop = await apiService.proposeAssistantNoteEdit(id, editText.trim());
      setProposal(prop);
    } catch (error: any) {
      Alert.alert(
        'Ошибка обработки изменений',
        error?.response?.data?.message || 'Не удалось обработать изменения',
      );
    } finally {
      setProposing(false);
    }
  };

  const handleApplyEdit = async () => {
    if (!proposal) return;

    try {
      setApplying(true);
      const updatedNote = await apiService.applyAssistantNoteEdit(id, proposal.id);
      setNote(updatedNote);
      setProposal(null);
      setEditText('');
      setEditModalVisible(false);
      Alert.alert('Успех', 'Изменения успешно применены');
    } catch (error: any) {
      if (error?.response?.status === 409) {
        Alert.alert(
          'Заметка изменилась',
          'Содержимое заметки изменилось. Пожалуйста, обновите страницу и повторите обработку изменений.',
        );
        setProposal(null);
        await fetchNoteAndReminders();
      } else {
        Alert.alert(
          'Ошибка применения',
          error?.response?.data?.message || 'Не удалось применить изменения',
        );
      }
    } finally {
      setApplying(false);
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

  const structuredData = note.structuredData as AssistantNoteStructuredOutput | null;
  const isStale = note.analysisStatus === AssistantNoteAnalysisStatus.STALE;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.statusBadge}>{note.status}</Text>
      </View>


      {/* Linked Order Banner */}
      {note.convertedOrderId ? (
        <View style={styles.linkedOrderBanner}>
          <Text style={styles.linkedOrderBannerText}>
            Из этой заметки создан заказ
          </Text>
          <TouchableOpacity
            style={styles.openOrderBtn}
            onPress={() => navigation.navigate('OrderDetail', { id: note.convertedOrderId })}
          >
            <Text style={styles.openOrderBtnText}>Открыть заказ</Text>
          </TouchableOpacity>
        </View>
      ) : null}

{/* STALE Banner */}
      {isStale ? (
        <View style={styles.staleBanner}>
          <Text style={styles.staleBannerText}>
            Заметка изменилась после последнего разбора.
          </Text>
          <TouchableOpacity
            style={styles.reanalyzeButton}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.reanalyzeButtonText}>Обновить разбор</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Structured AI View */}
      {structuredData && (structuredData.summary || (structuredData.sections && structuredData.sections.length > 0)) ? (
        <View style={styles.structuredCard}>
          <View style={styles.structuredHeaderRow}>
            <Text style={styles.structuredCardHeader}>Ассистент разобрал заметку</Text>


            <TouchableOpacity
              style={styles.createOrderNavButton}
              onPress={() => {
                const prefill = buildOrderPrefillFromNote(note);
                navigation.navigate('CreateOrder', { prefill, sourceNoteId: note.id });
              }}
            >
              <Text style={styles.createOrderNavButtonText}>📋 Создать заказ</Text>
            </TouchableOpacity>

<TouchableOpacity
              style={styles.tableNavButton}
              onPress={() => navigation.navigate('AssistantNoteTable', { id })}
            >
              <Text style={styles.tableNavButtonText}>📊 Таблица</Text>
            </TouchableOpacity>

<TouchableOpacity
              style={styles.editAssistantButton}
              onPress={() => setEditModalVisible(true)}
            >
              <Text style={styles.editAssistantButtonText}>Изменить через Ассистента</Text>
            </TouchableOpacity>
          </View>

          {structuredData.summary ? (
            <Text style={styles.structuredSummary}>{structuredData.summary}</Text>
          ) : null}

          {/* Sections & Items */}
          {structuredData.sections && structuredData.sections.length > 0 ? (
            structuredData.sections.map((sec, idx) => (
              <View key={sec.id || idx} style={styles.sectionBox}>
                <Text style={styles.sectionBoxTitle}>{sec.name}</Text>
                {sec.items && sec.items.map((item, itemIdx) => (
                  <View key={item.id || itemIdx} style={styles.itemRow}>
                    <Text style={styles.itemQuantity}>
                      {item.quantity ? `${item.quantity} ${item.unit || ''}` : ''}
                    </Text>
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                ))}
              </View>
            ))
          ) : null}

          {/* Tasks */}
          {structuredData.tasks && structuredData.tasks.length > 0 ? (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Задачи:</Text>
              {structuredData.tasks.map((task, taskIdx) => (
                <View key={task.id || taskIdx} style={styles.taskRow}>
                  <Text style={styles.taskText}>
                    • {task.text} {task.dateText ? `(${task.dateText})` : ''}
                  </Text>
                  <TouchableOpacity
                    style={styles.createReminderSmallBtn}
                    onPress={() => handleOpenReminderModal(task.text, task)}
                  >
                    <Text style={styles.createReminderSmallText}>+ Напоминание</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {/* Uncertainties */}
          {structuredData.uncertainties && structuredData.uncertainties.length > 0 ? (
            <View style={styles.uncertaintyBox}>
              <Text style={styles.uncertaintyTitle}>Нужно уточнить:</Text>
              {structuredData.uncertainties.map((unc, uncIdx) => (
                <Text key={unc.id || uncIdx} style={styles.uncertaintyQuestion}>
                  • {unc.question}
                </Text>
              ))}
            </View>
          ) : null}

          {/* Suggested Actions Badges */}
          {structuredData.suggestedActions && structuredData.suggestedActions.length > 0 ? (
            <View style={styles.actionsBox}>
              <Text style={styles.actionsBoxTitle}>Предложения Ассистента:</Text>
              <View style={styles.badgeRow}>
                {structuredData.suggestedActions.map((act, actIdx) => (
                  <TouchableOpacity
                    key={actIdx}
                    style={styles.actionBadge}
                    onPress={() => {
                      if (act.type === 'CREATE_REMINDER') {
                        handleOpenReminderModal(
                          structuredData.summary || note.title || 'Напоминание',
                        );
                      }
                    }}
                  >
                    <Text style={styles.actionBadgeText}>{act.type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.analyzePromptCard}>
          <Text style={styles.analyzePromptText}>
            Заметка еще не обработана Ассистентом.
          </Text>
          <TouchableOpacity
            style={styles.analyzeButton}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.analyzeButtonText}>Обработать заметку</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Reminders List Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Напоминания:</Text>
          <TouchableOpacity
            style={styles.addReminderBtn}
            onPress={() => handleOpenReminderModal(note.title || 'Напоминание')}
          >
            <Text style={styles.addReminderBtnText}>+ Добавить</Text>
          </TouchableOpacity>
        </View>

        {reminders && reminders.length > 0 ? (
          reminders.map((reminder) => (
            <View key={reminder.id} style={styles.reminderCard}>
              <View style={styles.reminderCardHeader}>
                <Text style={styles.reminderCardTitle}>{reminder.title}</Text>
                <Text
                  style={[
                    styles.reminderStatusText,
                    reminder.status === 'COMPLETED'
                      ? styles.statusCompleted
                      : reminder.status === 'CANCELLED'
                      ? styles.statusCancelled
                      : styles.statusScheduled,
                  ]}
                >
                  {reminder.status}
                </Text>
              </View>
              <Text style={styles.reminderTimeText}>
                ⏰ {new Date(reminder.scheduledAt).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {reminder.status === 'SCHEDULED' ? (
                <View style={styles.reminderActionsRow}>
                  <TouchableOpacity
                    style={styles.completeBtn}
                    onPress={() => handleCompleteReminder(reminder)}
                  >
                    <Text style={styles.actionBtnText}>✓ Выполнено</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => handleCancelReminder(reminder)}
                  >
                    <Text style={styles.actionBtnText}>✕ Отменить</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Нет активных напоминаний</Text>
        )}
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

      {/* Reminder Creator Modal */}
      <Modal visible={reminderModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Создать напоминание</Text>

            <Text style={styles.inputLabel}>Название:</Text>
            <TextInput
              style={styles.modalSingleInput}
              value={reminderTitle}
              onChangeText={setReminderTitle}
            />

            <Text style={styles.inputLabel}>Дата (ГГГГ-ММ-ДД):</Text>
            <TextInput
              style={styles.modalSingleInput}
              value={reminderDateStr}
              onChangeText={setReminderDateStr}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.inputLabel}>Время (ЧЧ:ММ):</Text>
            <TextInput
              style={styles.modalSingleInput}
              value={reminderTimeStr}
              onChangeText={setReminderTimeStr}
              placeholder="HH:MM"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setReminderModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyButton}
                onPress={handleConfirmCreateReminder}
                disabled={creatingReminder}
              >
                {creatingReminder ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalApplyText}>Создать</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Изменить через Ассистента</Text>

            {!proposal ? (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Например: Светильников теперь 12. Парящего 4м. Добавь карниз 3м."
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => {
                      setEditModalVisible(false);
                      setEditText('');
                    }}
                  >
                    <Text style={styles.modalCancelText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalProposeButton}
                    onPress={handleProposeEdit}
                    disabled={proposing}
                  >
                    {proposing ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalProposeText}>Обработать</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.proposalSummary}>
                  {proposal.summary || 'Ассистент предлагает изменения:'}
                </Text>

                <ScrollView style={styles.operationsList}>
                  {proposal.operations.map((op, idx) => (
                    <View key={idx} style={styles.operationRow}>
                      <Text style={styles.operationBadge}>{op.operation}</Text>
                      <Text style={styles.operationReason}>{op.reason}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setProposal(null)}
                  >
                    <Text style={styles.modalCancelText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalApplyButton}
                    onPress={handleApplyEdit}
                    disabled={applying}
                  >
                    {applying ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalApplyText}>Применить изменения</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  staleBanner: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEEBA',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  staleBannerText: { fontSize: 13, color: '#856404', flex: 1, marginRight: 8 },
  reanalyzeButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reanalyzeButtonText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  structuredCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 20,
  },
  structuredHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  structuredCardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
    flex: 1,
  },
  editAssistantButton: {
    backgroundColor: '#E5F1FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editAssistantButtonText: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  structuredSummary: { fontSize: 14, color: '#3A3A3C', marginBottom: 12, fontStyle: 'italic' },
  sectionBox: { marginTop: 8, marginBottom: 8 },
  sectionBoxTitle: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#F8F9FA',
    borderRadius: 4,
    marginBottom: 3,
  },
  itemName: { fontSize: 13, color: '#2C2C2E', flex: 1 },
  itemQuantity: { fontSize: 13, fontWeight: '600', color: '#007AFF', marginRight: 8 },
  subSection: { marginTop: 10 },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskText: { fontSize: 13, color: '#2C2C2E', flex: 1, marginRight: 8 },
  createReminderSmallBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  createReminderSmallText: { fontSize: 11, fontWeight: '600', color: '#FFF' },
  uncertaintyBox: {
    marginTop: 10,
    backgroundColor: '#FFF5F5',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30',
  },
  uncertaintyTitle: { fontSize: 13, fontWeight: '600', color: '#FF3B30', marginBottom: 4 },
  uncertaintyQuestion: { fontSize: 13, color: '#C0392B' },
  actionsBox: { marginTop: 10 },
  actionsBoxTitle: { fontSize: 12, color: '#8E8E93', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap' },
  actionBadge: {
    backgroundColor: '#E5F1FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  actionBadgeText: { fontSize: 11, fontWeight: '600', color: '#007AFF' },
  analyzePromptCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 20,
    alignItems: 'center',
  },
  analyzePromptText: { fontSize: 14, color: '#8E8E93', marginBottom: 10 },
  analyzeButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  analyzeButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  section: { marginBottom: 20 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#3A3A3C' },
  addReminderBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addReminderBtnText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  reminderCard: {
    backgroundColor: '#FFF',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  reminderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderCardTitle: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', flex: 1 },
  reminderStatusText: { fontSize: 11, fontWeight: '700' },
  statusScheduled: { color: '#34C759' },
  statusCompleted: { color: '#007AFF' },
  statusCancelled: { color: '#8E8E93' },
  reminderTimeText: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  reminderActionsRow: { flexDirection: 'row', marginTop: 8 },
  completeBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  cancelBtn: {
    backgroundColor: '#8E8E93',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
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

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  inputLabel: { fontSize: 13, color: '#3A3A3C', fontWeight: '600', marginBottom: 4 },
  modalSingleInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 16,
  },
  proposalSummary: { fontSize: 14, color: '#3A3A3C', marginBottom: 12, fontStyle: 'italic' },
  operationsList: { maxHeight: 200, marginBottom: 16 },
  operationRow: {
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  operationBadge: { fontSize: 12, fontWeight: '700', color: '#007AFF' },
  operationReason: { fontSize: 13, color: '#2C2C2E', marginTop: 2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  modalCancelButton: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 8 },
  modalCancelText: { fontSize: 14, color: '#8E8E93', fontWeight: '600' },
  modalProposeButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalProposeText: { fontSize: 14, color: '#FFF', fontWeight: '600' },
  modalApplyButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalApplyText: { fontSize: 14, color: '#FFF', fontWeight: '600' },

  tableNavButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 8,
  },
  tableNavButtonText: { fontSize: 12, fontWeight: '600', color: '#FFF' },


  createOrderNavButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 8,
  },
  createOrderNavButtonText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  linkedOrderBanner: {
    backgroundColor: '#E5F1FF',
    borderColor: '#B3D7FF',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkedOrderBannerText: { fontSize: 13, color: '#007AFF', fontWeight: '600', flex: 1 },
  openOrderBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openOrderBtnText: { color: '#FFF', fontWeight: '600', fontSize: 12 },

});