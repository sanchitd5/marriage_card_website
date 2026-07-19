import * as React from 'react';
import { Invocation } from './Invocation';

export interface FooterProps {
  /** The two monogram initials, joined by a cyan ampersand. */
  initials: [string, string];
  /** Optional Devanagari shloka + roman line above the monogram. */
  shloka?: string;
  /** Romanised transliteration for the shloka. */
  roman?: string;
  /** The closing message. */
  message: string;
  /** The sign-off lead-in (e.g. "Yours, in the greatest anticipation,"). */
  signoff?: string;
  /** The couple's names line under the sign-off. */
  names?: string;
  /** The hashtag. */
  hashtag?: string;
  className?: string;
}

/**
 * The hand-signed close — shloka, the cyan-ampersand monogram, a divider, the
 * closing message, the sign-off and the hashtag. The most intimate moment;
 * always centered and warm.
 */
export function Footer({ initials, shloka, roman, message, signoff, names, hashtag, className }: FooterProps) {
  const [a, b] = initials;
  return (
    <footer className={['tds-footer', className].filter(Boolean).join(' ')}>
      {shloka && <Invocation shloka={shloka} roman={roman} motifSize={54} />}
      <p className="tds-footer__mono">{a}<em>&amp;</em>{b}</p>
      <span className="tds-footer__rule" aria-hidden="true" />
      <p className="tds-footer__line">{message}</p>
      {(signoff || names) && (
        <p className="tds-footer__sign">{signoff}{names && <strong>{names}</strong>}</p>
      )}
      {hashtag && <p className="tds-footer__tag">{hashtag}</p>}
    </footer>
  );
}
