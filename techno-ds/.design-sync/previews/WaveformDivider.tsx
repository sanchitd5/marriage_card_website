import * as React from 'react';
import { TechnoProvider, WaveformDivider } from 'techno-ds';

const bg: React.CSSProperties = { padding: '3rem 2rem', background: '#0b0c0f' };

export const Default = () => (
  <TechnoProvider style={bg}>
    <WaveformDivider />
  </TechnoProvider>
);

export const Short = () => (
  <TechnoProvider style={bg}>
    <WaveformDivider bars={9} />
  </TechnoProvider>
);
