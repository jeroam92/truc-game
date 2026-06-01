import { useTranslation } from 'react-i18next';

export default function LangToggle() {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  function toggle(l) {
    i18n.changeLanguage(l);
    localStorage.setItem('lang', l);
  }

  return (
    <div className="lang-toggle">
      <button className={`lang-btn ${lang === 'va' ? 'active' : ''}`} onClick={() => toggle('va')}>VAL</button>
      <button className={`lang-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => toggle('es')}>ES</button>
    </div>
  );
}
