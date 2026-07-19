import * as React from 'react';
import { TechnoProvider, Atmosphere, SectionHeader, WaveformDivider } from 'techno-ds';

export const Ground = () => (
  <TechnoProvider>
    <Atmosphere style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <SectionHeader align="center" kicker="The most anticipated set of the season">
        Until the <em>drop</em>
      </SectionHeader>
      <WaveformDivider />
    </Atmosphere>
  </TechnoProvider>
);

export const NoVignette = () => (
  <TechnoProvider>
    <Atmosphere vignette={false} style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <SectionHeader align="center" kicker="Signal locked">Obsidian, <em>one cold light</em></SectionHeader>
    </Atmosphere>
  </TechnoProvider>
);
