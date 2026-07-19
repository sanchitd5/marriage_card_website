import * as React from 'react';

export interface WaveformDividerProps {
  /** Number of bars. Default `17`. Every 3rd bar tips cyan. */
  bars?: number;
  className?: string;
}

/**
 * The signature "electronic heartbeat" — a row of ice-white spectrum bars, every
 * third tipped cyan. The system's section seam / divider motif. Crisp, no glow.
 */
export function WaveformDivider({ bars = 17, className }: WaveformDividerProps) {
  const heights = [40, 62, 85, 55, 30, 70, 95, 48, 60, 38, 80, 52, 44, 72, 33, 66, 50];
  return (
    <div
      className={['tds-waveform', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ height: `${heights[i % heights.length]}%` }} />
      ))}
    </div>
  );
}
