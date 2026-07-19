import * as React from 'react';

export interface SealButtonProps {
  /** The two monogram initials, e.g. `["S", "R"]` — joined by a cyan ampersand. */
  initials: [string, string];
  /** Hint line beneath the seal (e.g. "Tap to enter"). */
  hint?: string;
  /** Accessible label. Default "Break the seal and enter". */
  ariaLabel?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

/**
 * The glyph seal the guest taps to enter — a crisp cyan ring around the couple's
 * monogram on a pressed obsidian disc, no bloom. The gate's focal control.
 */
export function SealButton({ initials, hint, ariaLabel = 'Break the seal and enter', onClick, className }: SealButtonProps) {
  const [a, b] = initials;
  return (
    <div className={className}>
      <button type="button" className="tds-seal" aria-label={ariaLabel} onClick={onClick}>
        <span className="tds-seal__ring" aria-hidden="true" />
        <span className="tds-seal__mono">{a}<em>&amp;</em>{b}</span>
      </button>
      {hint && <p className="tds-seal-hint">{hint}</p>}
    </div>
  );
}
