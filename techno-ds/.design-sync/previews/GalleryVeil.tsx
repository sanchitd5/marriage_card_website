import * as React from 'react';
import { TechnoProvider, GalleryVeil } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Sealed = () => (
  <TechnoProvider style={bg}>
    <GalleryVeil frameCount={11} />
  </TechnoProvider>
);

export const NoCount = () => (
  <TechnoProvider style={bg}>
    <GalleryVeil note="The gallery opens after the celebration." />
  </TechnoProvider>
);
