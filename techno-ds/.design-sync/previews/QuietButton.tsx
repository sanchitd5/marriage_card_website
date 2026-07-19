import * as React from 'react';
import { TechnoProvider, QuietButton } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f', display: 'flex', gap: '1.6rem' };

export const Actions = () => (
  <TechnoProvider style={bg}>
    <QuietButton href="#">Get directions</QuietButton>
    <QuietButton>Add to calendar</QuietButton>
  </TechnoProvider>
);
