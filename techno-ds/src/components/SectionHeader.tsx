import * as React from 'react';
import { Kicker } from './Kicker';
import { DisplayHead } from './Heading';

export interface SectionHeaderProps {
  /** Mono eyebrow line above the heading. */
  kicker?: string;
  /** The heading text. Wrap emphasis in `<em>` for tonal (weight) emphasis. */
  children?: React.ReactNode;
  /** Alignment of the header block. Default `"left"`. */
  align?: 'left' | 'center';
  className?: string;
}

/**
 * The canonical section header — a mono kicker over a display heading. The
 * standard way every band opens ("The running order" / "Three sets, two
 * hearts"). Left-anchored by default; centre for the hero/emotional bands.
 */
export function SectionHeader({ kicker, children, align = 'left', className }: SectionHeaderProps) {
  const cls = ['tds-section-header', align === 'center' && 'tds-section-header--center', className].filter(Boolean).join(' ');
  return (
    <header className={cls}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <DisplayHead>{children}</DisplayHead>
    </header>
  );
}
