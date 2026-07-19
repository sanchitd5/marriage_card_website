import * as React from 'react';

export interface NatarajaMotifProps {
  /** Pixel size of the square emblem. */
  size?: number;
  /** Extra class names. */
  className?: string;
}

/**
 * Nataraja / cosmic-dance invocation emblem — an abstract prabha-mandala ring
 * with a precise instrument dial, Shiva's crescent, and a central bindu. Static
 * by intent (the sacred mark is never tilted or shimmered). Inherits `color`.
 */
export function NatarajaMotif({ size = 56, className }: NatarajaMotifProps) {
  return (
    <svg
      className={['tds-invocation__motif', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="50" cy="50" r="46" strokeWidth="1" />
        <circle cx="50" cy="50" r="38" strokeWidth=".5" opacity=".55" />
        <path strokeWidth="1.7" d="M50 3.5 V10" />
        <path strokeWidth=".8" d="M96.5 50 H91 M50 96.5 V91 M3.5 50 H9" />
        <path strokeWidth="1.5" d="M56 31 A20 20 0 1 0 56 69 A15 20 0 1 1 56 31" />
        <circle cx="50" cy="50" r="1.8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
