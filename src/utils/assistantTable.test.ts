import { localizeUnit, formatQuantity, buildTableSections } from './assistantTable';
import { AssistantNoteStructuredOutput } from '../types/assistant';

describe('Assistant Notes Table Utilities & Localization', () => {
  describe('localizeUnit', () => {
    it('correctly maps canonical units to Russian labels', () => {
      expect(localizeUnit('m2')).toBe('м²');
      expect(localizeUnit('sqm')).toBe('м²');
      expect(localizeUnit('m')).toBe('м');
      expect(localizeUnit('pcs')).toBe('шт');
      expect(localizeUnit('kg')).toBe('кг');
      expect(localizeUnit('l')).toBe('л');
      expect(localizeUnit('pack')).toBe('уп');
    });

    it('returns original string safely for unknown or custom units', () => {
      expect(localizeUnit('рулон')).toBe('рулон');
      expect(localizeUnit('')).toBe('');
      expect(localizeUnit(null)).toBe('');
    });
  });

  describe('formatQuantity', () => {
    it('formats null or undefined quantity as a hyphen placeholder', () => {
      expect(formatQuantity(null)).toBe('—');
      expect(formatQuantity(undefined)).toBe('—');
    });

    it('preserves zero as a valid quantity rather than missing placeholder', () => {
      expect(formatQuantity(0)).toBe('0');
    });

    it('formats positive numbers correctly', () => {
      expect(formatQuantity(20)).toBe('20');
      expect(formatQuantity(15.5)).toBe('15.5');
    });
  });

  describe('buildTableSections & Zero Pricing Verification', () => {
    it('preserves section/room grouping from structuredData', () => {
      const mockStructuredData: AssistantNoteStructuredOutput = {
        summary: 'Замер двух комнат',
        sections: [
          {
            id: 'sec-1',
            name: 'Спальня',
            items: [{ name: 'Матовый потолок', quantity: 20, unit: 'm2' }],
          },
          {
            id: 'sec-2',
            name: 'Кухня',
            items: [{ name: 'Светильники', quantity: 8, unit: 'pcs' }],
          },
        ],
      };

      const sections = buildTableSections(mockStructuredData);

      expect(sections.length).toBe(2);
      expect(sections[0].name).toBe('Спальня');
      expect(sections[0].items[0].name).toBe('Матовый потолок');
      expect(sections[1].name).toBe('Кухня');
      expect(sections[1].items[0].name).toBe('Светильники');
    });

    it('creates an unassigned General section for standalone items without room grouping', () => {
      const mockStructuredData: AssistantNoteStructuredOutput = {
        summary: 'Простой список',
        items: [{ name: 'Карниз', quantity: 3, unit: 'm' }],
      };

      const sections = buildTableSections(mockStructuredData);

      expect(sections.length).toBe(1);
      expect(sections[0].name).toBe('Общее');
      expect(sections[0].items[0].name).toBe('Карниз');
    });

    it('verifies that output data contains zero price, cost, or financial fields', () => {
      const mockStructuredData: AssistantNoteStructuredOutput = {
        summary: 'Замер',
        items: [{ name: 'Потолок', quantity: 20, unit: 'm2' }],
      };

      const sections = buildTableSections(mockStructuredData);
      const jsonStr = JSON.stringify(sections);

      expect(jsonStr).not.toContain('price');
      expect(jsonStr).not.toContain('cost');
      expect(jsonStr).not.toContain('total');
      expect(jsonStr).not.toContain('amount');
    });
  });
});
