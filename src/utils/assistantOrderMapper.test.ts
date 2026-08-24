import { buildOrderPrefillFromNote } from './assistantOrderMapper';
import { AssistantNote, AssistantNoteStatus, AssistantNoteAnalysisStatus } from '../types/assistant';

describe('Assistant Notes Order Prefill Mapper Utility', () => {
  it('builds prefill title, details, and date deterministically from structuredData', () => {
    const mockNote: AssistantNote = {
      id: 'note-10',
      userId: 'user-1',
      title: 'Замер двух комнат',
      status: AssistantNoteStatus.STRUCTURED,
      version: 1,
      analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
      createdAt: '2026-08-25T10:00:00Z',
      updatedAt: '2026-08-25T10:00:00Z',
      structuredData: {
        titleSuggestion: 'Заказ: Натяжные потолки в спальне и кухне',
        summary: 'Замер двух помещений 38м2',
        sections: [
          {
            name: 'Спальня',
            items: [
              { name: 'Матовый потолок', quantity: 20, unit: 'm2' },
              { name: 'Светильники', quantity: 15, unit: 'pcs' },
            ],
          },
          {
            name: 'Кухня',
            items: [{ name: 'Потолок', quantity: 18, unit: 'm2' }],
          },
        ],
        tasks: [{ text: 'Заказать полотно', dateText: 'завтра' }],
        uncertainties: [{ question: 'Уточнить тип светильников' }],
        dates: [{ text: 'завтра', resolvedDate: '2026-08-26' }],
      },
    };

    const prefill = buildOrderPrefillFromNote(mockNote);

    expect(prefill.title).toBe('Заказ: Натяжные потолки в спальне и кухне');
    expect(prefill.date).toBe('2026-08-26');
    expect(prefill.details).toContain('Спальня:');
    expect(prefill.details).toContain('• Матовый потолок — 20 м²');
    expect(prefill.details).toContain('• Светильники — 15 шт');
    expect(prefill.details).toContain('Кухня:');
    expect(prefill.details).toContain('• Потолок — 18 м²');
    expect(prefill.details).toContain('Задачи:');
    expect(prefill.details).toContain('• Заказать полотно (завтра)');
    expect(prefill.details).toContain('⚠ Требует уточнения:');
    expect(prefill.details).toContain('• Уточнить тип светильников');
  });

  it('verifies that prefill data contains NO prices, totals, or cost calculations', () => {
    const mockNote: AssistantNote = {
      id: 'note-11',
      userId: 'user-1',
      title: 'Note',
      status: AssistantNoteStatus.STRUCTURED,
      version: 1,
      analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
      createdAt: '2026-08-25T10:00:00Z',
      updatedAt: '2026-08-25T10:00:00Z',
      structuredData: {
        titleSuggestion: 'Заказ',
        items: [{ name: 'Потолок', quantity: 20, unit: 'm2' }],
      },
    };

    const prefill = buildOrderPrefillFromNote(mockNote);
    const jsonStr = JSON.stringify(prefill);

    expect(jsonStr).not.toContain('price');
    expect(jsonStr).not.toContain('cost');
    expect(jsonStr).not.toContain('total');
    expect(jsonStr).not.toContain('amount');
  });
});
