import { AssistantNote, AssistantNoteStructuredOutput } from '../types/assistant';
import { localizeUnit, formatQuantity } from './assistantTable';

export interface OrderPrefillData {
  title: string;
  details: string;
  date?: string;
  address?: string;
}

export function buildOrderPrefillFromNote(note: AssistantNote): OrderPrefillData {
  const structured = note.structuredData as AssistantNoteStructuredOutput | null;

  const title =
    structured?.titleSuggestion || note.title || 'Заказ из заметки';

  const detailsLines: string[] = [];

  if (structured) {
    if (structured.summary) {
      detailsLines.push(`Резюме: ${structured.summary}\n`);
    }

    if (Array.isArray(structured.sections) && structured.sections.length > 0) {
      structured.sections.forEach((sec) => {
        detailsLines.push(`${sec.name}:`);
        if (Array.isArray(sec.items)) {
          sec.items.forEach((item) => {
            const qtyStr = formatQuantity(item.quantity);
            const unitStr = localizeUnit(item.unit);
            const qtyFormatted = qtyStr !== '—' ? ` — ${qtyStr} ${unitStr}`.trimEnd() : '';
            detailsLines.push(`• ${item.name}${qtyFormatted}`);
          });
        }
        detailsLines.push('');
      });
    } else if (Array.isArray(structured.items) && structured.items.length > 0) {
      detailsLines.push('Позиции:');
      structured.items.forEach((item) => {
        const qtyStr = formatQuantity(item.quantity);
        const unitStr = localizeUnit(item.unit);
        const qtyFormatted = qtyStr !== '—' ? ` — ${qtyStr} ${unitStr}`.trimEnd() : '';
        detailsLines.push(`• ${item.name}${qtyFormatted}`);
      });
      detailsLines.push('');
    }

    if (Array.isArray(structured.tasks) && structured.tasks.length > 0) {
      detailsLines.push('Задачи:');
      structured.tasks.forEach((t) => {
        detailsLines.push(`• ${t.text}${t.dateText ? ` (${t.dateText})` : ''}`);
      });
      detailsLines.push('');
    }

    if (Array.isArray(structured.uncertainties) && structured.uncertainties.length > 0) {
      detailsLines.push('⚠ Требует уточнения:');
      structured.uncertainties.forEach((unc) => {
        detailsLines.push(`• ${unc.question}`);
      });
      detailsLines.push('');
    }
  } else if (note.rawText) {
    detailsLines.push(note.rawText);
  }

  let resolvedDate: string | undefined = undefined;
  if (structured?.dates && structured.dates.length > 0) {
    const firstResolved = structured.dates.find((d) => d.resolvedDate);
    if (firstResolved?.resolvedDate) {
      resolvedDate = firstResolved.resolvedDate;
    }
  }

  return {
    title: title.trim(),
    details: detailsLines.join('\n').trim(),
    date: resolvedDate,
  };
}
