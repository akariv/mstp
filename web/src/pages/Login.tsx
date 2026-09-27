import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { setUiLang } from '../lib/i18n';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { signIn, error } = useAuth();
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <button
          className="block ml-auto mb-6 text-sm font-bold text-pen"
          onClick={() => setUiLang(i18n.language === 'nl' ? 'en' : 'nl')}
        >
          {t('lang.switch')}
        </button>
        <div className="ruled rounded-3xl border border-rule px-6 sm:px-8 pt-7 pb-8 shadow-[0_18px_40px_-24px_rgba(20,33,61,.35)]">
          <p className="font-display font-extrabold text-pen text-lg">
            <span className="hl">Toets</span>trainer
          </p>
          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold leading-[1.05]">{t('login.title')}</h1>
          <p className="mt-5 text-ink-soft text-lg">{t('login.body')}</p>
          <button
            onClick={signIn}
            className="mt-8 w-full inline-flex items-center justify-center gap-3 rounded-xl bg-pen text-sheet font-bold py-3.5 text-lg shadow-[0_3px_0_0_rgba(0,0,0,.2)] active:translate-y-px"
          >
            <svg viewBox="0 0 48 48" className="size-5 bg-white rounded-sm p-0.5" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {t('login.button')}
          </button>
          {error && (
            <p role="alert" className="mt-5 text-bad font-bold leading-snug">
              {t(`login.${error}`)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
