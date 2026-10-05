import { useSyncExternalStore } from 'react';
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@shared';

// Keep in sync with the inline script in index.html, which applies the stored choice before first paint.
const STORAGE_KEY = 'appearance';
const FONT_LINKS: Partial<Record<Appearance['font'], string>> = {
  serif: 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&display=swap',
  comic: 'https://fonts.googleapis.com/css2?family=Comic+Neue:ital,wght@0,400;0,700;1,400&display=swap',
};

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function read(): Appearance {
  try {
    return parseAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let current = read();
const listeners = new Set<() => void>();

function loadFont(font: Appearance['font']) {
  const href = FONT_LINKS[font];
  if (!href || document.querySelector(`link[data-font-link="${font}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.fontLink = font;
  document.head.appendChild(link);
}

/** Loads every optional font, so the settings page can preview them. */
export function preloadFonts() {
  (Object.keys(FONT_LINKS) as Appearance['font'][]).forEach(loadFont);
}

function apply(a: Appearance) {
  const root = document.documentElement;
  const dark = a.mode === 'dark' || (a.mode === 'system' && !!darkQuery?.matches);
  root.dataset.palette = a.palette;
  root.dataset.font = a.font;
  root.dataset.mode = dark ? 'dark' : 'light';

  loadFont(a.font);

  // Browser chrome (mobile address bar) follows the page background.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = paper;
  document.head.appendChild(meta);
}

darkQuery?.addEventListener('change', () => {
  if (current.mode !== 'system') return;
  apply(current);
  listeners.forEach((l) => l());
});
apply(current);

export function setAppearance(next: Partial<Appearance>): Appearance {
  current = parseAppearance({ ...current, ...next });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode: still applied for this visit */
  }
  apply(current);
  listeners.forEach((l) => l());
  return current;
}

export function getAppearance(): Appearance {
  return current;
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
