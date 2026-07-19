import * as React from 'react';
import { TechnoProvider, Kicker, DisplayHead, WaveformDivider } from 'techno-ds';

export const Ground = () => (
  <TechnoProvider style={{ padding: '3rem 2rem' }}>
    <Kicker>The techno ground</Kicker>
    <DisplayHead>Obsidian, <em>one cold light</em></DisplayHead>
    <WaveformDivider />
  </TechnoProvider>
);
