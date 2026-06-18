import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { ru } from './translations';

const translations = {
  ru: ru,
  en: ru, // Fallback to Russian for now as per market focus
};

const i18n = new I18n(translations);

// Set the locale once at the beginning of your app.
i18n.locale = getLocales()[0].languageCode ?? 'ru';
i18n.enableFallback = true;

export default i18n;
