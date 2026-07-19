import * as React from 'react';
import { TechnoProvider, Hero } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 1.5rem', background: '#0b0c0f' };

export const Invitation = () => (
  <TechnoProvider style={bg}>
    <Hero
      names={['Sanchit', 'Riya']}
      shloka="तं नुमः सात्त्विकं शिवम् ॥"
      kicker="Dearest friends, it is with the greatest pleasure that we announce the union of"
      dateLine="11 & 12 December 2026 · Chandigarh & Ambala"
      hashtag="#SanchitKiRiya"
    />
  </TechnoProvider>
);

export const NamesOnly = () => (
  <TechnoProvider style={bg}>
    <Hero names={['Aisha', 'Rohan']} dateLine="Save the date" hashtag="#AishaAndRohan" />
  </TechnoProvider>
);
