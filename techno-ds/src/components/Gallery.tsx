import * as React from 'react';

export interface GalleryItem {
  /** Image URL. */
  src: string;
  /** Alt text. */
  alt?: string;
  /** Grid emphasis: `"tall"` spans two rows, `"wide"` spans two columns. */
  span?: 'tall' | 'wide';
}

export interface GalleryProps {
  /** The photo frames. */
  items: GalleryItem[];
  className?: string;
}

/**
 * The revealed photo gallery — a dense masonry of framed images, each toned to
 * the obsidian palette (grayscale + a faint cyan cast). The unveiled counterpart
 * to `GalleryVeil`. Use `span` on an item to feature it.
 */
export function Gallery({ items, className }: GalleryProps) {
  return (
    <div className={['tds-gallery', className].filter(Boolean).join(' ')}>
      {items.map((it, i) => (
        <figure
          key={i}
          className={['tds-gframe', it.span === 'tall' && 'tds-gframe--tall', it.span === 'wide' && 'tds-gframe--wide'].filter(Boolean).join(' ')}
        >
          <img src={it.src} alt={it.alt || ''} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
        </figure>
      ))}
    </div>
  );
}
