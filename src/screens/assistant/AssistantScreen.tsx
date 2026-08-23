import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import AppIcon from '../../components/AppIcon';
import { COLORS, SHADOWS } from '../../constants/theme';
import { apiService } from '../../services/ApiService';
import { AssistantNote } from '../../types';
import { formatDate } from '../../utils/date';

export default function AssistantScreen({ navigation }: any) {
  const [notes, setNotes] = useState<AssistantNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiService.getAssistantNotes();
      const list = Array.isArray(res.data) ? res.data : [];
      setNotes(list);
    } catch (e: any) {
      setError('Не удалось загрузить заметки');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchNotes();
    });
    return unsubscribe;
  }, [navigation, fetchNotes]);

  const renderNoteItem = ({ item }: { item: AssistantNote }) => {
    return (
      <TouchableOpacity
        style={styles.noteCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AssistantNoteDetail', { noteId: item.id })}
      >
        <View style={styles.noteHeader}>
          <Text style={styles.noteTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[
            styles.statusBadge,
            item.status === 'STRUCTURED' && styles.statusBadgeStructured
          ]}>
            <Text style={[
              styles.statusText,
              item.status === 'STRUCTURED' && styles.statusTextStructured
            ]}>
              {item.status === 'STRUCTURED' ? 'Структурировано' : 'Заметка'}
            </Text>
          </View>
        </View>

        {item.rawText ? (
          <Text style={styles.notePreview} numberOfLines={2}>
            {item.rawText}
          </Text>
        ) : null}

        <Text style={styles.noteDate}>
          {formatDate(item.updatedAt || item.createdAt)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <AppIcon name="nav-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ассистент</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Запишите то, что важно. Позже сможете дополнить или использовать заметку.
        </Text>

        <TouchableOpacity
          style={styles.createBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AssistantNoteEditor', { mode: 'create' })}
        >
          <AppIcon name="tab-create" size={22} color="#fff" />
          <Text style={styles.createBtnText}>Новая заметка</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Последние заметки</Text>

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchNotes()}>
              <Text style={styles.retryBtnText}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppIcon name="action-attach" size={48} color={COLORS.border} />
            <Text style={styles.emptyText}>
              Пока нет заметок.{'\n'}
              Создайте первую — сюда можно записать замер, мысль или информацию по объекту.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notes}
            keyExtractor={item => item.id}
            renderItem={renderNoteItem}
            contentContainerStyle={{ paddingBottom: 30 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchNotes(true)} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  content: { flex: 1, padding: 20 },
  subtitle: { fontSize: 14, color: COLORS.gray, lineHeight: 20, marginBottom: 16 },
  createBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    marginBottom: 24,
    ...SHADOWS.soft,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: COLORS.danger, fontSize: 15, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  retryBtn: { backgroundColor: COLORS.primary + '15', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  retryBtnText: { color: COLORS.primary, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  emptyText: { color: COLORS.gray, fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  noteCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  noteTitle: { fontSize: 16, fontWeight: '800', color: COLORS.dark, flex: 1, marginRight: 8 },
  statusBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeStructured: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  statusTextStructured: { color: '#10B981' },
  notePreview: { fontSize: 14, color: COLORS.gray, lineHeight: 20, marginBottom: 8 },
  noteDate: { fontSize: 12, color: COLORS.placeholder },
});
