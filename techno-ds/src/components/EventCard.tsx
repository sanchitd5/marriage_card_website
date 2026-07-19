import * as React from 'react';

export interface EventCardProps {
  /** The track label, e.g. "Track 01" or "Headline". */
  track: string;
  /** Event name, e.g. "Haldi". */
  name: string;
  /** When, e.g. "Friday, 11 December 2026 · 11 o'clock in the morning". */
  when: string;
  /** Venue line. */
  venue: string;
  /** Dress-code value, e.g. "Shades of yellow". */
  dressCode?: string;
  /** `"headline"` gives the climax act its cyan top-rule + lifted panel. Default `"default"`. */
  variant?: 'default' | 'headline';
  /** Optional action links/buttons (e.g. directions, add-to-calendar). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * An event card in the DJ-set "running order" — track label, name, when, venue,
 * dress code, and quiet actions. The `"headline"` variant marks the climax act
 * with the earned cyan top-rule and a lifted panel.
 */
export function EventCard({ track, name, when, venue, dressCode, variant = 'default', actions, className }: EventCardProps) {
  const cls = ['tds-event-card', variant === 'headline' && 'tds-event-card--headline', className].filter(Boolean).join(' ');
  return (
    <article className={cls}>
      <p className="tds-event-card__no">{track}</p>
      <h3 className="tds-event-card__name">{name}</h3>
      <p className="tds-event-card__when">{when}</p>
      <p className="tds-event-card__venue">{venue}</p>
      {dressCode && (
        <p className="tds-event-card__dress"><span>Dress code</span>{dressCode}</p>
      )}
      {actions && <div className="tds-event-card__actions">{actions}</div>}
    </article>
  );
}

export interface QuietButtonProps {
  children?: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  className?: string;
}

/**
 * The quiet mono action used inside event cards (directions, add-to-calendar) —
 * an underlined uppercase link that lights cyan on hover. Renders an `<a>` when
 * `href` is set, else a `<button>`.
 */
export function QuietButton({ children, href, onClick, className }: QuietButtonProps) {
  const cls = ['tds-btn-quiet', className].filter(Boolean).join(' ');
  if (href) return <a className={cls} href={href} onClick={onClick}>{children}</a>;
  return <button type="button" className={cls} onClick={onClick}>{children}</button>;
}
