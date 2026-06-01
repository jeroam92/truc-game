import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es.json';
import va from './va.json';

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, va: { translation: va } },
  lng: localStorage.getItem('lang') || 'va',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18n;
