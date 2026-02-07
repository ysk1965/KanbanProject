import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const languages = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find(l => l.code === i18n.language) || languages[1];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  if (variant === 'compact') {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
        >
          <Globe className="h-4 w-4" />
          <span>{currentLang.code.toUpperCase()}</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[140px]">
            {languages.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleChange(lang.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  lang.code === i18n.language
                    ? 'text-bridge-accent bg-bridge-accent/10'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors text-sm"
      >
        <Globe className="h-4 w-4" />
        <span>{currentLang.flag} {currentLang.label}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[160px]">
          {languages.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors ${
                lang.code === i18n.language
                  ? 'text-bridge-accent bg-bridge-accent/10'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
