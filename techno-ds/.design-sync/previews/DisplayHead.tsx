import * as React from 'react';
import { TechnoProvider, DisplayHead, Kicker } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const TonalEmphasis = () => (
  <TechnoProvider style={bg}>
    <Kicker>A courtship, in frames</Kicker>
    <DisplayHead>The story <em>so far</em></DisplayHead>
  </TechnoProvider>
);

export const RunningOrder = () => (
  <TechnoProvider style={bg}>
    <Kicker>The running order</Kicker>
    <DisplayHead>Three sets, <em>two hearts</em></DisplayHead>
  </TechnoProvider>
);
