import * as React from 'react';
import { TechnoProvider, Interlude } from 'techno-ds';

// On-brand abstract placeholder (no real photo ships in the DS).
const portrait =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'>" +
      "<defs><radialGradient id='g' cx='50%' cy='36%' r='72%'>" +
      "<stop offset='0' stop-color='#20323a'/><stop offset='1' stop-color='#0b0c0f'/></radialGradient></defs>" +
      "<rect width='400' height='500' fill='url(#g)'/>" +
      "<path d='M120 155 Q200 60 280 155 L280 345 Q200 300 120 345 Z' fill='none' stroke='#38bdf8' stroke-width='1' opacity='.4'/>" +
      "<circle cx='200' cy='215' r='72' fill='none' stroke='#22d3ee' stroke-width='1' opacity='.5'/></svg>"
  );

export const Split = () => (
  <TechnoProvider style={{ padding: '2rem', background: '#0b0c0f' }}>
    <Interlude
      image={portrait}
      imageAlt="The couple"
      kicker="Between the sets"
      quote="“Two frequencies, phase-locked long before they ever met.”"
      attribution="— B-side · the story so far"
    />
  </TechnoProvider>
);
