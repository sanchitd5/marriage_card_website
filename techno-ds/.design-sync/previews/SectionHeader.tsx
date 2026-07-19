import * as React from 'react';
import { TechnoProvider, SectionHeader } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const LeftAnchored = () => (
  <TechnoProvider style={bg}>
    <SectionHeader kicker="The running order">Three sets, <em>two hearts</em></SectionHeader>
  </TechnoProvider>
);

export const Centered = () => (
  <TechnoProvider style={bg}>
    <SectionHeader align="center" kicker="A courtship, in frames">The story <em>so far</em></SectionHeader>
  </TechnoProvider>
);
