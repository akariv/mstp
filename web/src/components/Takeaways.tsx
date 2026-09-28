import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TakeawaysDoc } from '@shared';

function readShowEn(): boolean {
  try {
    return localStorage.getItem('takeawaysEn') !== 'off';
  } catch {
    return true;
  }
}

/** Condensed bilingual summary: every Dutch sentence with its English translation right below it. */
export default function TakeawaysView({ doc }: { doc: TakeawaysDoc }) {
  const { t } = useTranslation();
  const [showEn, setShowEn] = useState(readShowEn);

  const toggle = () => {
    setShowEn(!showEn);
    try {
      localStorage.setItem('takeawaysEn', showEn ? 'off' : 'on');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={toggle} className="text-sm font-bold text-pen underline underline-offset-4">
          {showEn ? t('takeaways.hideEn') : t('takeaways.showEn')}
        </button>
      </div>
      {doc.sections.map((section, i) => (
        <section key={i}>
          <h3 className="font-bold text-lg">
            <span lang="nl">{section.headingNl}</span>
            {showEn && (
              <span className="block text-muted font-normal text-sm" lang="en">
                {section.headingEn}
              </span>
            )}
          </h3>
          <ul className="mt-2 space-y-2.5">
            {section.sentences.map((s, j) => (
              <li key={j} className="pl-4 border-l-[3px] border-hl">
                <p lang="nl" className="leading-snug">
                  {s.nl}
                </p>
                {showEn && (
                  <p lang="en" className="text-sm text-muted italic leading-snug mt-0.5">
                    {s.en}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {doc.keyTerms.length > 0 && (
        <section>
          <h3 className="font-bold text-lg">{t('takeaways.keyTerms')}</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {doc.keyTerms.map((k) => (
              <div key={k.nl} className="rounded-xl border border-rule px-3 py-2">
                <dt>
                  <span className="hl font-bold" lang="nl">
                    {k.nl}
                  </span>{' '}
                  {showEn && (
                    <span className="text-muted" lang="en">
                      {k.en}
                    </span>
                  )}
                </dt>
                <dd className="text-sm mt-1">
                  <span lang="nl">{k.explanationNl}</span>
                  {showEn && (
                    <span className="block text-muted italic" lang="en">
                      {k.explanationEn}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
