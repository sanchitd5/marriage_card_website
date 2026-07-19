import * as React from 'react';

export interface KickerProps {
  /** The eyebrow text (rendered uppercase, letter-spaced). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Mono eyebrow / section label — the whisper voice of the system. Space Mono,
 * wide tracking, uppercase, muted. Sits above a heading.
 */
export function Kicker({ children, className }: KickerProps) {
  return <p className={['tds-kicker', className].filter(Boolean).join(' ')}>{children}</p>;
}
