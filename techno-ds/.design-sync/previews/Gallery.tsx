import * as React from 'react';
import { TechnoProvider, Gallery } from 'techno-ds';

// On-brand abstract placeholder tiles (no real photos ship in the DS).
const tile = (hex: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 375'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='#" + hex + "'/><stop offset='1' stop-color='#0b0c0f'/></linearGradient></defs>" +
      "<rect width='300' height='375' fill='url(#g)'/>" +
      "<circle cx='150' cy='150' r='46' fill='none' stroke='#22d3ee' stroke-width='1' opacity='.35'/></svg>"
  );

export const Masonry = () => (
  <TechnoProvider style={{ padding: '2rem', background: '#0b0c0f' }}>
    <Gallery
      items={[
        { src: tile('1c2b33'), alt: 'A quiet moment', span: 'tall' },
        { src: tile('232833'), alt: 'A twirl' },
        { src: tile('1a222c'), alt: 'The question' },
        { src: tile('26313b'), alt: 'Laughing' },
        { src: tile('182028'), alt: 'Dancing', span: 'wide' },
        { src: tile('202832'), alt: 'Golden hour' },
      ]}
    />
  </TechnoProvider>
);
