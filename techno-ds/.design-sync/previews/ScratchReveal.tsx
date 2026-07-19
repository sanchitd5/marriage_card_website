import * as React from 'react';
import { TechnoProvider, ScratchReveal } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Foil = () => (
  <TechnoProvider style={bg}>
    <ScratchReveal
      prompt="“Some dates drop without warning. This one you get to see coming.”"
      hint="A gentle scratch of your fingertip will do"
      date="12 December 2026"
      sub="Ambala Cantt"
    />
  </TechnoProvider>
);

export const Revealed = () => (
  <TechnoProvider style={bg}>
    <ScratchReveal date="12 December 2026" sub="Ambala Cantt" revealed />
  </TechnoProvider>
);
