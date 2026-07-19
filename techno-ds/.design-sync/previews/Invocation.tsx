import * as React from 'react';
import { TechnoProvider, Invocation } from 'techno-ds';

const bg: React.CSSProperties = { padding: '2.5rem 2rem', background: '#0b0c0f' };

export const WithRoman = () => (
  <TechnoProvider style={bg}>
    <Invocation shloka="आङ्गिकं भुवनं यस्य वाचिकं सर्ववाङ्मयम् ।" roman="āṅgikaṃ bhuvanaṃ yasya · vācikaṃ sarva-vāṅmayam" />
  </TechnoProvider>
);

export const ShlokaOnly = () => (
  <TechnoProvider style={bg}>
    <Invocation shloka="तं नुमः सात्त्विकं शिवम् ॥" />
  </TechnoProvider>
);
