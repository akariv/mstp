import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BADGES, levelFromXp } from '@shared';

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 py-10 justify-center text-muted" role="status">
      <span className="size-5 rounded-full border-[3px] border-rule border-t-pen animate-spin" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

/** Circular progress in pen-blue with the value highlighted in the middle. */
export function Ring({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--pen)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span className="absolute font-display font-bold text-sm tabular-nums">{Math.round(v)}%</span>
    </div>
  );
}

export function Bar({ value, tone = 'pen' }: { value: number; tone?: 'pen' | 'hl' }) {
  return (
    <div className="h-2 rounded-full bg-rule/70 overflow-hidden">
      <div
        className={tone === 'pen' ? 'h-full bg-pen rounded-full' : 'h-full bg-hl rounded-full'}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, transition: 'width .6s ease' }}
      />
    </div>
  );
}

export function ScoreText({ score, className = '' }: { score: number | null | undefined; className?: string }) {
  if (score == null) return <span className={`text-muted ${className}`}>–</span>;
  const cls = score >= 80 ? 'hl-green' : score >= 55 ? 'hl' : 'hl-pink';
  return <span className={`${cls} font-display font-bold tabular-nums ${className}`}>{score}</span>;
}

export function LevelBar({ xp }: { xp: number }) {
  const { t } = useTranslation();
  const { level, into, needed } = levelFromXp(xp);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-display font-bold text-base">{t('home.level', { level })}</span>
        <span className="text-muted truncate">{t('home.xpToNext', { xp: needed - into, next: level + 1 })}</span>
      </div>
      <div className="mt-1.5">
        <Bar value={(100 * into) / needed} tone="hl" />
      </div>
    </div>
  );
}

const BADGE_ICONS: Record<string, string> = {
  'first-answer': '✏️',
  'answered-10': '📘',
  'answered-50': '📚',
  'answered-100': '🏛️',
  'streak-3': '🔥',
  'streak-7': '🌟',
  'dutch-80': '🗣️',
  'subject-complete': '🏁',
  'perfect-score': '💯',
  'words-25': '🔤',
  'words-100': '🏆',
};

export function Badges({ earned }: { earned: string[] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {BADGES.map((b) => {
        const has = earned.includes(b);
        return (
          <li
            key={b}
            className={`rounded-xl px-2 py-3 text-center text-xs leading-tight border ${
              has ? 'bg-sheet border-rule' : 'border-dashed border-rule text-muted opacity-60'
            }`}
            title={t(`badges.${b}`)}
          >
            <div className={`text-2xl mb-1 ${has ? '' : 'grayscale'}`} aria-hidden>
              {BADGE_ICONS[b]}
            </div>
            {t(`badges.${b}`)}
          </li>
        );
      })}
    </ul>
  );
}

export function wordBadges(wordsKnown: number): string[] {
  return [...(wordsKnown >= 25 ? ['words-25'] : []), ...(wordsKnown >= 100 ? ['words-100'] : [])];
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-pen font-bold text-sm py-2 hover:underline">
      <span aria-hidden>‹</span> {children}
    </Link>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-pen text-sheet hover:brightness-110 shadow-[0_3px_0_0_rgba(0,0,0,.18)] active:translate-y-px active:shadow-none',
    secondary: 'bg-sheet text-pen border-2 border-pen hover:bg-pen-soft',
    ghost: 'text-pen hover:bg-pen-soft',
    danger: 'bg-sheet text-bad border-2 border-bad/60 hover:bg-bad/10',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold transition disabled:opacity-50 disabled:pointer-events-none ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-sheet rounded-2xl border border-rule p-4 sm:p-5 ${className}`}>{children}</div>;
}
