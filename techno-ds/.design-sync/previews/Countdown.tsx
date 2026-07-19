import * as React from 'react';
import { TechnoProvider, Countdown } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Row = () => (
  <TechnoProvider style={bg}>
    <Countdown days={146} hours={12} minutes={35} seconds={9} />
  </TechnoProvider>
);

export const Stack = () => (
  <TechnoProvider style={bg}>
    <Countdown days={146} hours={12} minutes={35} seconds={9} layout="stack" />
  </TechnoProvider>
);
