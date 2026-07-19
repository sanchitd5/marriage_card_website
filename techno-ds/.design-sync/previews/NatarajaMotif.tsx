import * as React from 'react';
import { TechnoProvider, NatarajaMotif } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem', background: '#0b0c0f', display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center' };

export const Sizes = () => (
  <TechnoProvider style={bg}>
    <NatarajaMotif size={48} />
    <NatarajaMotif size={72} />
    <NatarajaMotif size={112} />
  </TechnoProvider>
);
