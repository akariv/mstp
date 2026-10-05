import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { FONTS, MODES, PALETTES, type Appearance } from '@shared';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { preloadFonts, setAppearance, useAppearance } from '../lib/appearance';
import { setUiLang } from '../lib/i18n';

const FONT_FAMILIES: Record<Appearance['font'], string> = {
  sans: "'Atkinson Hyperlegible', ui-sans-serif, sans-serif",
  serif: "'Literata', Georgia, serif",
  comic: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive",
};

const MODE_ICONS: Record<Appearance['mode'], string> = { system: '🖥️', light: '☀️', dark: '🌙' };

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const appearance = useAppearance();
  const shownMode = document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';

  useEffect(preloadFonts, []);

  const choose = (next: Partial<Appearance>) => {
    const a = setAppearance(next);
    // Saved on the profile too, so the choice follows the student to other devices.
    if (user && profile) updateDoc(doc(db, 'users', user.uid), { appearance: a }).catch(console.error);
  };

  const chooseLang = (lang: 'nl' | 'en') => {
    setUiLang(lang);
    if (user && profile) updateDoc(doc(db, 'users', user.uid), { uiLang: lang }).catch(console.error);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-3xl font-extrabold">{t('settings.title')}</h1>

      <section>
        <h2 className="text-xl font-bold mb-3">{t('settings.palette')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label={t('settings.palette')}>
          {PALETTES.map((p) => {
            const selected = appearance.palette === p;
            return (
              <button
                key={p}
                role="radio"
                aria-checked={selected}
                onClick={() => choose({ palette: p })}
                // The preview renders in its own palette (CSS tokens are scoped to data-palette / data-mode).
                data-palette={p}
                data-mode={shownMode}
                className={`text-left rounded-2xl p-3 border-2 transition-colors ${
                  selected ? 'border-[var(--pen)] ring-2 ring-[var(--pen)]/30' : 'border-[var(--rule)]'
                }`}
                style={{ background: 'var(--paper)', color: 'var(--ink)' }}
              >
                <div className="rounded-xl px-3 py-2.5 border" style={{ background: 'var(--sheet)', borderColor: 'var(--rule)' }}>
                  <p className="font-display font-extrabold leading-tight" style={{ color: 'var(--pen)' }}>
                    <span className="hl">Toets</span>trainer
                  </p>
                  <div className="mt-2 flex items-center gap-1.5" aria-hidden>
                    <span className="h-2 flex-1 rounded-full" style={{ background: 'var(--pen)' }} />
                    <span className="size-3 rounded-full" style={{ background: 'var(--hl-green)' }} />
                    <span className="size-3 rounded-full" style={{ background: 'var(--hl)' }} />
                    <span className="size-3 rounded-full" style={{ background: 'var(--hl-pink)' }} />
                  </div>
                </div>
                <p className="mt-2 font-bold flex items-center justify-between">
                  {t(`settings.palettes.${p}`)}
                  {selected && <span aria-hidden>✓</span>}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{t('settings.mode')}</h2>
        <div className="inline-flex flex-wrap rounded-xl border-2 border-pen p-0.5" role="radiogroup" aria-label={t('settings.mode')}>
          {MODES.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={appearance.mode === m}
              onClick={() => choose({ mode: m })}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${appearance.mode === m ? 'bg-pen text-sheet' : 'text-pen'}`}
            >
              <span aria-hidden>{MODE_ICONS[m]}</span> {t(`settings.modes.${m}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">{t('settings.font')}</h2>
        <p className="text-muted text-sm mb-3">{t('settings.fontHint')}</p>
        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label={t('settings.font')}>
          {FONTS.map((f) => {
            const selected = appearance.font === f;
            return (
              <button
                key={f}
                role="radio"
                aria-checked={selected}
                onClick={() => choose({ font: f })}
                className={`text-left rounded-2xl p-4 border-2 bg-sheet ${selected ? 'border-pen' : 'border-rule'}`}
              >
                <p className="font-bold flex items-center justify-between text-sm text-muted">
                  {t(`settings.fonts.${f}`)}
                  {selected && <span aria-hidden className="text-pen">✓</span>}
                </p>
                <p className="mt-1 text-lg leading-snug" style={{ fontFamily: FONT_FAMILIES[f] }} lang="nl">
                  {t('settings.sample')}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{t('settings.language')}</h2>
        <div className="inline-flex rounded-xl border-2 border-pen p-0.5" role="radiogroup" aria-label={t('settings.language')}>
          {(['nl', 'en'] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={i18n.language === l}
              onClick={() => chooseLang(l)}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${i18n.language === l ? 'bg-pen text-sheet' : 'text-pen'}`}
            >
              {l === 'nl' ? '🇳🇱 Nederlands' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
