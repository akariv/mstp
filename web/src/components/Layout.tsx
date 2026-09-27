import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { setUiLang } from '../lib/i18n';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { role, profile, user, signOut } = useAuth();

  const toggleLang = () => {
    const next = i18n.language === 'nl' ? 'en' : 'nl';
    setUiLang(next);
    if (user && profile) updateDoc(doc(db, 'users', user.uid), { uiLang: next }).catch(() => {});
  };

  const tabs = [
    { to: '/', label: t('nav.practice'), icon: '✏️', end: true },
    { to: '/woorden', label: t('nav.words'), icon: '🔤' },
    { to: '/kaartjes', label: t('nav.cards'), icon: '🃏' },
    ...(role === 'admin' ? [{ to: '/beheer', label: t('nav.admin'), icon: '⚙️' }] : []),
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-rule">
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center gap-3">
          <NavLink to="/" className="font-display font-extrabold text-xl text-pen tracking-tight">
            <span className="hl">Toets</span>trainer
          </NavLink>
          <nav className="hidden md:flex items-center gap-1 ml-6" aria-label="Main">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg font-bold text-sm ${isActive ? 'bg-pen-soft text-pen' : 'text-ink-soft hover:text-pen'}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggleLang} className="px-2.5 py-1.5 rounded-lg text-sm font-bold text-pen hover:bg-pen-soft">
              {t('lang.switch')}
            </button>
            <button onClick={signOut} className="px-2.5 py-1.5 rounded-lg text-sm text-muted hover:text-ink" title={t('nav.signOut')}>
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={t('nav.signOut')} className="size-7 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                t('nav.signOut')
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 pt-4 pb-28 md:pb-12">
        <Outlet />
      </main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-sheet border-t border-rule pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${isActive ? 'text-pen' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl leading-none ${isActive ? 'hl px-1' : ''}`} aria-hidden>
                    {tab.icon}
                  </span>
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
