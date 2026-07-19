import * as React from 'react';
import { NatarajaMotif } from './NatarajaMotif';

export interface GalleryVeilProps {
  /** The secrecy copy. */
  note?: string;
  /** Total frames sealed (renders as a locked "00 / N frames" counter). */
  frameCount?: number;
  /** The mono seal label. Default "Sealed". */
  label?: string;
  className?: string;
}

/**
 * The gallery veil — a deliberately sealed object standing in for photos held
 * until after the celebration. Crosshair-seal + "Sealed" + a locked frame count.
 * Reads as intentional withholding, never an empty state.
 */
export function GalleryVeil({ note = 'Their story is kept close, to be unveiled after the celebration', frameCount, label = 'Sealed', className }: GalleryVeilProps) {
  return (
    <figure className={['tds-veil', className].filter(Boolean).join(' ')}>
      <NatarajaMotif size={60} className="tds-veil__motif" />
      <span className="tds-veil__label">{label}</span>
      <p className="tds-veil__note">{note}</p>
      {typeof frameCount === 'number' && (
        <span className="tds-veil__count">00 / {String(frameCount).padStart(2, '0')} frames</span>
      )}
    </figure>
  );
}
