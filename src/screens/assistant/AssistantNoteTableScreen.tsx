import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiService } from '../../services/ApiService';
import {
  AssistantNote,
  AssistantNoteAnalysisStatus,
  AssistantNoteStatus,
} from '../../types/assistant';
import { localizeUnit, formatQuantity, buildTableSections } from '../../utils/assistantTable';

interface Props {
  route: {
    params: {
      id: string;
    };
  };
  navigation: any;
}

export const AssistantNoteTableScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id } = route.params;
  const [note, setNote] = useState<AssistantNote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reanalyzing, setReanalyzing] = useState<boolean>(false);

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

  const handleReanalyze = async () => {
    try {
      setReanalyzing(true);
      const updated = await apiService.analyzeAssistantNote(id);
      setNote(updated);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.response?.data?.message || 'Не удалось обновить разбор');
    } finally {
      setReanalyzing(false);
    }
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

  const sections = buildTableSections(note.structuredData);
  const isStale = note.analysisStatus === AssistantNoteAnalysisStatus.STALE;
  const isArchived = note.status === AssistantNoteStatus.ARCHIVED;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.subtitle}>Таблица заметки</Text>
      </View>

      {/* STALE Warning */}
      {isStale ? (
        <View style={styles.staleBanner}>
          <Text style={styles.staleText}>
            Заметка изменилась. Таблица построена по предыдущему разбору.
          </Text>
          <TouchableOpacity
            style={styles.reanalyzeBtn}
            onPress={handleReanalyze}
            disabled={reanalyzing}
          >
            {reanalyzing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.reanalyzeBtnText}>Обновить разбор</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Archived Warning */}
      {isArchived ? (
        <View style={styles.archivedBanner}>
          <Text style={styles.archivedText}>Заметка в архиве (только чтение)</Text>
        </View>
      ) : null}

      {/* Table Content */}
      {sections.length > 0 ? (
        sections.map((sec, secIdx) => (
          <View key={sec.id || secIdx} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{sec.name}</Text>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colHeader, styles.colName]}>Позиция</Text>
              <Text style={[styles.colHeader, styles.colQty]}>Кол-во</Text>
              <Text style={[styles.colHeader, styles.colUnit]}>Ед.</Text>
            </View>

            {sec.items && sec.items.length > 0 ? (
              sec.items.map((item, itemIdx) => (
                <View key={item.id || itemIdx} style={styles.tableBodyRow}>
                  <Text style={[styles.colData, styles.colName]}>{item.name}</Text>
                  <Text style={[styles.colData, styles.colQty]}>
                    {formatQuantity(item.quantity)}
                  </Text>
                  <Text style={[styles.colData, styles.colUnit]}>
                    {localizeUnit(item.unit)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Нет позиций в этом разделе</Text>
            )}
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>В заметке не найдено структурированных позиций</Text>
        </View>
      )}

      {/* Action to edit note via AI */}
      {!isArchived ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.navigate('AssistantNoteDetail', { id })}
          >
            <Text style={styles.editButtonText}>Вернуться к заметке для изменения</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  content: { padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#FF3B30' },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1C1C1E' },
  subtitle: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
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
  staleText: { fontSize: 13, color: '#856404', flex: 1, marginRight: 8 },
  reanalyzeBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reanalyzeBtnText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  archivedBanner: {
    backgroundColor: '#E5E5EA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  archivedText: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#007AFF', marginBottom: 10 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingBottom: 6,
    marginBottom: 6,
  },
  colHeader: { fontSize: 12, fontWeight: '700', color: '#8E8E93' },
  colData: { fontSize: 14, color: '#1C1C1E' },
  colName: { flex: 2 },
  colQty: { width: 60, textAlign: 'right' },
  colUnit: { width: 50, textAlign: 'right' },
  tableBodyRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  emptyText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic' },
  actionRow: { marginTop: 10 },
  editButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
