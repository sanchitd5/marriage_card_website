import * as React from 'react';

export interface CountdownProps {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** `"row"` = four cells side by side; `"stack"` = a vertical readout list. Default `"row"`. */
  layout?: 'row' | 'stack';
  /** Pad values to 2 digits. Default `true`. */
  pad?: boolean;
  className?: string;
}

interface CellProps { value: number; label: string; pad: boolean; }
function Cell({ value, label, pad }: CellProps) {
  const shown = pad ? String(value).padStart(2, '0') : String(value);
  return (
    <div className="tds-count-cell">
      <span className="tds-count-num">{shown}</span>
      <span className="tds-count-label">{label}</span>
    </div>
  );
}

/**
 * The countdown readout — mono tabular digits in sealed cells with a cyan top
 * hairline. `"row"` lays four cells across; `"stack"` is a vertical readout that
 * pairs well beside a scratch card. The "Until the drop" counter.
 */
export function Countdown({ days, hours, minutes, seconds, layout = 'row', pad = true, className }: CountdownProps) {
  const cls = ['tds-countdown', layout === 'stack' && 'tds-countdown--stack', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="timer" aria-live="off">
      <Cell value={days} label="Days" pad={false} />
      <Cell value={hours} label="Hours" pad={pad} />
      <Cell value={minutes} label="Minutes" pad={pad} />
      <Cell value={seconds} label="Seconds" pad={pad} />
    </div>
  );
}
