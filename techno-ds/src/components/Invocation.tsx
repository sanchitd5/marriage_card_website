import * as React from 'react';
import { NatarajaMotif } from './NatarajaMotif';

export interface InvocationProps {
  /** The Devanagari shloka line (rendered in Noto Serif Devanagari, cyan). */
  shloka: string;
  /** Optional romanised transliteration shown beneath in mono. */
  roman?: string;
  /** Show the Nataraja motif above the line. Default `true`. */
  motif?: boolean;
  /** Motif pixel size. Default `56`. */
  motifSize?: number;
  className?: string;
}

/**
 * The sacred invocation block — the Nataraja emblem above a Devanagari shloka,
 * with an optional romanised line. The one place cyan is always earned (the
 * sacred line carries the light). Always centered, never animated.
 */
export function Invocation({ shloka, roman, motif = true, motifSize = 56, className }: InvocationProps) {
  return (
    <div className={['tds-invocation', className].filter(Boolean).join(' ')}>
      {motif && <NatarajaMotif size={motifSize} />}
      <span className="tds-shloka" lang="sa">{shloka}</span>
      {roman && <span className="tds-shloka-roman" aria-hidden="true">{roman}</span>}
    </div>
  );
}
