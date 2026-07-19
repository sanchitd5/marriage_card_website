import * as React from 'react';
import { TechnoProvider, Footer } from 'techno-ds';

const bg: React.CSSProperties = { background: '#0b0c0f' };

export const SignOff = () => (
  <TechnoProvider style={bg}>
    <Footer
      initials={['S', 'R']}
      shloka="तं नुमः सात्त्विकं शिवम् ॥"
      roman="taṃ numaḥ sāttvikaṃ śivam"
      message="Some love stories cannot merely be told, they must be witnessed. We would be honoured to have you on the floor with us."
      signoff="Yours, in the greatest anticipation,"
      names="Sanchit & Riya"
      hashtag="#SanchitKiRiya"
    />
  </TechnoProvider>
);
