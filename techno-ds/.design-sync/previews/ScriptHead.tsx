import * as React from 'react';
import { TechnoProvider, ScriptHead, Kicker } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const Heading = () => (
  <TechnoProvider style={bg}>
    <Kicker>The most anticipated set of the season</Kicker>
    <ScriptHead>Until the drop</ScriptHead>
  </TechnoProvider>
);
