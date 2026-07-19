import * as React from 'react';
import { TechnoProvider, Kicker } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Labels = () => (
  <TechnoProvider style={bg}>
    <Kicker>The most anticipated set of the season</Kicker>
    <Kicker>The running order</Kicker>
    <Kicker>A courtship, in frames</Kicker>
  </TechnoProvider>
);
