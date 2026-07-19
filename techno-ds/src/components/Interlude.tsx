import * as React from 'react';

export interface InterludeProps {
  /** URL of the portrait image (rendered with a cyan duotone overlay). */
  image: string;
  /** Alt text for the portrait. */
  imageAlt?: string;
  /** The pull-quote / heart-line. */
  quote: string;
  /** Small mono label above the quote (e.g. "Between the sets"). */
  kicker?: string;
  /** Optional attribution / sub-line under the quote. */
  attribution?: string;
  className?: string;
}

/**
 * The interlude — a contained editorial split: a cyan-duotone portrait as the
 * dominant mass on the left, the heart-line scaled up opposite with a mono
 * kicker above and a cyan tick below. The story beat between the informational
 * bands; the portrait wins, the quote stays dignified.
 */
export function Interlude({ image, imageAlt = '', quote, kicker = 'Between the sets', attribution, className }: InterludeProps) {
  return (
    <div className={['tds-interlude', className].filter(Boolean).join(' ')}>
      <figure className="tds-interlude__art">
        <img src={image} alt={imageAlt} loading="lazy" decoding="async" />
      </figure>
      <div className="tds-interlude__copy">
        {kicker && <p className="tds-interlude__kicker">{kicker}</p>}
        <p className="tds-interlude__quote">{quote}</p>
        <span className="tds-interlude__tick" aria-hidden="true" />
        {attribution && <p className="tds-interlude__attr">{attribution}</p>}
      </div>
    </div>
  );
}
