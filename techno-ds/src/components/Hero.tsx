import * as React from 'react';
import { Invocation } from './Invocation';
import { WaveformDivider } from './WaveformDivider';

export interface HeroProps {
  /** The couple's first names, e.g. `["Sanchit", "Riya"]` — joined by a cyan ampersand. */
  names: [string, string];
  /** Optional Devanagari shloka shown above the kicker. */
  shloka?: string;
  /** The invitational eyebrow line above the names. */
  kicker?: string;
  /** The date / location line beneath the names. */
  dateLine?: string;
  /** The hashtag shown at the bottom (e.g. "#SanchitKiRiya"). */
  hashtag?: string;
  className?: string;
}

/**
 * The hero — the couple's names at full display scale with a single cyan
 * ampersand, framed by the shloka, an invitational kicker, the waveform seam and
 * the hashtag. The emotional core; always centered.
 */
export function Hero({ names, shloka, kicker, dateLine, hashtag, className }: HeroProps) {
  const [a, b] = names;
  return (
    <header className={['tds-hero', className].filter(Boolean).join(' ')}>
      {shloka && <Invocation shloka={shloka} motifSize={54} />}
      {kicker && <p className="tds-kicker tds-hero__kicker">{kicker}</p>}
      <h1 className="tds-hero__names">
        <span className="tds-hero__name">{a}</span>
        <span className="tds-hero__amp">&amp;</span>
        <span className="tds-hero__name">{b}</span>
      </h1>
      {dateLine && <p className="tds-hero__date">{dateLine}</p>}
      <WaveformDivider />
      {hashtag && <p className="tds-hero__tag">{hashtag}</p>}
    </header>
  );
}
