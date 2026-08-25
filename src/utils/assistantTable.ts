import {
  AssistantNoteStructuredOutput,
  AssistantNoteStructuredSection,
  AssistantNoteStructuredItem,
} from '../types/assistant';

export function localizeUnit(unit?: string | null): string {
  if (!unit) return '';

  const normalized = unit.toLowerCase().trim();
  switch (normalized) {
    case 'm2':
    case 'sqm':
      return 'м²';
    case 'm':
      return 'м';
    case 'pcs':
    case 'pc':
      return 'шт';
    case 'kg':
      return 'кг';
    case 'l':
      return 'л';
    case 'pack':
      return 'уп';
    default:
      return unit;
  }
}

export function formatQuantity(quantity?: number | null): string {
  if (quantity === null || quantity === undefined) {
    return '—';
  }
  return String(quantity);
}

export function buildTableSections(
  structuredData?: AssistantNoteStructuredOutput | null,
): AssistantNoteStructuredSection[] {
  if (!structuredData) return [];

  const sections: AssistantNoteStructuredSection[] = [];

  if (Array.isArray(structuredData.sections) && structuredData.sections.length > 0) {
    structuredData.sections.forEach((sec) => {
      sections.push({
        id: sec.id,
        name: sec.name || 'Общее',
        items: Array.isArray(sec.items) ? sec.items : [],
      });
    });
  }

  if (Array.isArray(structuredData.items) && structuredData.items.length > 0) {
    let generalSec = sections.find((s) => s.name === 'Общее');
    if (!generalSec) {
      generalSec = { id: 'general-section', name: 'Общее', items: [] };
      sections.push(generalSec);
    }
    generalSec.items.push(...structuredData.items);
  }

  return sections;
}
