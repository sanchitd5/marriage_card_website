import * as React from 'react';
import { Band, Kicker, DisplayHead } from 'techno-ds';

export const Tinted = () => (
  <Band tint>
    <Kicker>The running order</Kicker>
    <DisplayHead>Three sets, <em>two hearts</em></DisplayHead>
  </Band>
);

export const Plain = () => (
  <Band>
    <Kicker>A courtship, in frames</Kicker>
    <DisplayHead>The story <em>so far</em></DisplayHead>
  </Band>
);
