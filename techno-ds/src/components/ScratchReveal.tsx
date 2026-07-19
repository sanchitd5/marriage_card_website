import * as React from 'react';

export interface ScratchRevealProps {
  /** The teasing prompt above the card. */
  prompt?: string;
  /** The mono hint line (e.g. "A gentle scratch of your fingertip will do"). */
  hint?: string;
  /** The hidden value revealed underneath (e.g. the date). */
  date: string;
  /** Sub-line beneath the revealed value. */
  sub?: string;
  /** When `false`, the graphite foil covers the value with "Scratch to reveal".
   *  When `true`, the value is shown. Default `false`. */
  revealed?: boolean;
  /** Foil caption. Default "Scratch to reveal". */
  foilLabel?: string;
  className?: string;
}

/**
 * The scratch-to-reveal date card — a brushed-graphite foil with a cyan sheen
 * hiding the date beneath. Presentational: toggle `revealed` to show the foil vs.
 * the revealed value (the live site adds the canvas scratch interaction).
 */
export function ScratchReveal({ prompt, hint, date, sub, revealed = false, foilLabel = 'Scratch to reveal', className }: ScratchRevealProps) {
  return (
    <div className={['tds-scratch', className].filter(Boolean).join(' ')}>
      {prompt && <p className="tds-scratch__prompt">{prompt}</p>}
      {hint && <p className="tds-scratch__hint">{hint}</p>}
      <div className="tds-scratch__frame">
        <div className="tds-scratch__under">
          <span className="tds-scratch__date">{date}</span>
          {sub && <span className="tds-scratch__sub">{sub}</span>}
        </div>
        {!revealed && (
          <div className="tds-scratch__foil"><span>{foilLabel}</span></div>
        )}
      </div>
    </div>
  );
}
