import * as React from 'react';

export interface BandProps {
  /** Section content. */
  children?: React.ReactNode;
  /** Apply the translucent tint gradient (used on alternating sections). */
  tint?: boolean;
  /** Center content and constrain to the reading column. Default `true`. */
  contained?: boolean;
  className?: string;
}

/**
 * A full-width page section on the obsidian ground. `tint` applies the
 * translucent gradient used on alternating bands; `contained` wraps children in
 * the centered reading column. The layout primitive every section sits in.
 */
export function Band({ children, tint, contained = true, className }: BandProps) {
  const cls = ['tds-band', tint && 'tds-band--tint', className].filter(Boolean).join(' ');
  return (
    <section className={cls}>
      {contained ? <div className="tds-band__inner">{children}</div> : children}
    </section>
  );
}
