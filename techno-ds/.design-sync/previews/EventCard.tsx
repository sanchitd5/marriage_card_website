import * as React from 'react';
import { TechnoProvider, EventCard, QuietButton } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2rem', background: '#0b0c0f' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.4rem' };

export const RunningOrder = () => (
  <TechnoProvider style={bg}>
    <div style={grid}>
      <EventCard
        track="Track 01" name="Haldi"
        when="Friday, 11 December 2026 · morning"
        venue="Radisson Hotel Chandigarh Zirakpur"
        dressCode="Shades of yellow"
        actions={<><QuietButton href="#">Get directions</QuietButton><QuietButton>Add to calendar</QuietButton></>}
      />
      <EventCard
        track="Track 02" name="Cocktail & Engagement"
        when="Friday, 11 December 2026 · evening"
        venue="Radisson Hotel Chandigarh Zirakpur"
        dressCode="Dazzling as you dare"
        actions={<><QuietButton href="#">Get directions</QuietButton><QuietButton>Add to calendar</QuietButton></>}
      />
      <EventCard
        track="Headline" name="The Wedding" variant="headline"
        when="Saturday, 12 December 2026 · evening"
        venue="De'vansh Resort, Ambala Cantt"
        dressCode="Traditional grandeur"
        actions={<><QuietButton href="#">Get directions</QuietButton><QuietButton>Add to calendar</QuietButton></>}
      />
    </div>
  </TechnoProvider>
);

export const Headline = () => (
  <TechnoProvider style={{ ...bg, maxWidth: '24rem' }}>
    <EventCard
      track="Headline" name="The Wedding" variant="headline"
      when="Saturday, 12 December 2026 · 7 o'clock in the evening"
      venue="De'vansh Resort, Ambala Cantt"
      dressCode="Traditional grandeur"
    />
  </TechnoProvider>
);
