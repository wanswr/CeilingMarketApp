import { AssistantNote, AssistantNoteStatus } from '../../types';

describe('Assistant Note Types & Contract Validation', () => {
  it('validates AssistantNoteStatus values', () => {
    const draftStatus: AssistantNoteStatus = 'DRAFT';
    const structuredStatus: AssistantNoteStatus = 'STRUCTURED';
    const archivedStatus: AssistantNoteStatus = 'ARCHIVED';

    expect(draftStatus).toBe('DRAFT');
    expect(structuredStatus).toBe('STRUCTURED');
    expect(archivedStatus).toBe('ARCHIVED');
  });

  it('validates AssistantNote object structure', () => {
    const mockNote: AssistantNote = {
      id: 'note-uuid-1',
      userId: 'user-uuid-1',
      title: 'Квартира на Ленинском',
      rawText: 'Замер 20 кв м',
      structuredData: { area: 20 },
      status: 'DRAFT',
      createdAt: '2026-08-23T13:00:00.000Z',
      updatedAt: '2026-08-23T13:00:00.000Z',
    };

    expect(mockNote.title).toBe('Квартира на Ленинском');
    expect(mockNote.status).toBe('DRAFT');
    expect(mockNote.structuredData?.area).toBe(20);
  });
});
