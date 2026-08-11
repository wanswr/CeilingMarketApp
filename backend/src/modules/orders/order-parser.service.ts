import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderParserService {
  parseOrderText(text: string) {
    const cleanText = text.replace(/\[\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}\].*?:/g, '').trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
    const result: any = {
      title: '',
      details: text,
      price: 0,
      address: '',
      date: new Date(),
    };

    const priceRegex = /(?:зп|зарплата|цена|стоимость|выплата)[:\s-]*(\d[\d\s.,]{3,})/i;
    const priceMatch = text.match(priceRegex);

    if (priceMatch) {
      const rawPrice = priceMatch[1].replace(/[\s.,]/g, '');
      result.price = parseInt(rawPrice, 10);
    } else {
        const currencyRegex = /(\d[\d\s.,]*)(?:₽|р|руб|рублей)/i;
        const currencyMatch = text.match(currencyRegex);
        if (currencyMatch) {
            result.price = parseInt(currencyMatch[1].replace(/[\s.,]/g, ''), 10);
        }
    }

    const today = new Date();
    const daysOfWeek: Record<string, number> = {
      'воскресенье': 0, 'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6
    };

    if (/сегодня/i.test(cleanText)) {
      result.date = new Date(today);
    } else if (/завтра/i.test(cleanText)) {
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      result.date = tomorrow;
    } else if (/послезавтра/i.test(cleanText)) {
      const dayAfter = new Date();
      dayAfter.setDate(today.getDate() + 2);
      result.date = dayAfter;
    } else {
      for (const [dayName, dayIndex] of Object.entries(daysOfWeek)) {
        const dayRegex = new RegExp(`(?:на|в|во)?\\s*${dayName.slice(0, -1)}`, 'i');
        if (dayRegex.test(cleanText)) {
          const targetDate = new Date();
          const currentDay = today.getDay();
          let daysUntil = dayIndex - currentDay;
          if (daysUntil <= 0) daysUntil += 7;
          targetDate.setDate(today.getDate() + daysUntil);
          result.date = targetDate;
          break;
        }
      }
    }

    const addressKeywords = ['улица', 'ул', 'шоссе', 'ш', 'проспект', 'пр', 'бульвар', 'б-р', 'переулок', 'пер', 'набережная', 'наб', 'корпус', 'корп', 'дом', 'д', 'жк'];
    const cities = ['москва', 'котельники', 'истра', 'химки', 'балашиха', 'красногорск', 'люберцы', 'мытищи', 'одинцово', 'подольск', 'ясенево', 'коммунарка', 'видное', 'варшавское', 'римского', 'корсако', 'судостроительная'];

    for (const line of lines) {
       const lowerLine = line.toLowerCase();
       const isPriceLine = /зп|зарплата|цена|руб|₽/i.test(lowerLine);
       const isDateLine = /завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\\d{1,2}\\.\\d{1,2}/i.test(lowerLine);

       const hasCity = cities.some(c => lowerLine.includes(c));
       const hasKeyword = addressKeywords.some(k => lowerLine.includes(k + '.') || lowerLine.includes(k + ' ') || lowerLine.includes(' ' + k) || lowerLine === k);
       const hasHouseNum = /\\d+[а-я]?/.test(lowerLine) && !isPriceLine && !isDateLine && (lowerLine.includes(' ') || lowerLine.length < 10 || lowerLine.match(/\\d+к\\d+/));

       if ((hasCity || hasKeyword || hasHouseNum) && !isPriceLine && !isDateLine) {
         result.address = line;
         const idx = lines.indexOf(line);
         if (idx !== -1 && idx < lines.length - 1) {
             const nextLine = lines[idx+1];
             if (nextLine.length < 40 && !/зп|цена|руб|завтра|сегодня/i.test(nextLine)) {
                 if (nextLine.match(/\\d+/) || line.length < 25 || nextLine.toLowerCase().includes('жк') || cities.some(c => nextLine.toLowerCase().includes(c))) {
                    result.address += ', ' + nextLine;
                 }
             }
         }
         break;
       }
    }

    for (const line of lines) {
        if (result.address && result.address.includes(line)) continue;
        const lowerLine = line.toLowerCase();
        if (/завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\\d{1,2}\\.\\d{1,2}/i.test(line)) continue;
        if (/зп|зарплата|цена|руб|₽/i.test(line)) continue;

        if (lowerLine.includes('потолок') || lowerLine.includes('монтаж') || lowerLine.includes('замер') || lowerLine.includes('ремонт')) {
            result.title = line;
            break;
        }

        if (!result.title && line.length > 5 && line.length < 60) {
            result.title = line;
        }
    }

    if (!result.title) result.title = "Монтаж натяжных потолков";

    return result;
  }
}
