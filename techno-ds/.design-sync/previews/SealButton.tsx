import * as React from 'react';
import { TechnoProvider, SealButton } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Seal = () => (
  <TechnoProvider style={bg}>
    <SealButton initials={['S', 'R']} hint="Tap to enter" />
  </TechnoProvider>
);
