import * as React from 'react';

export interface AtmosphereProps {
  /** Content rendered above the atmosphere. */
  children?: React.ReactNode;
  /** Draw the radial vignette that crushes the edges to black. Default `true`. */
  vignette?: boolean;
  /** Draw the faint central cyan light-shaft. Default `true`. */
  shaft?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The obsidian ground — a CSS approximation of the live WebGL backdrop: a haze
 * gradient, an optional central cyan light-shaft, and an edge vignette. Wrap a
 * hero or section in it to sit content in atmospheric depth instead of flat
 * black. (The real site swaps this for the reactive WebGL haze-tunnel.)
 */
export function Atmosphere({ children, vignette = true, shaft = true, className, style }: AtmosphereProps) {
  return (
    <div className={['tds-atmosphere', className].filter(Boolean).join(' ')} style={style}>
      <div className="tds-atmosphere__haze" aria-hidden="true" />
      {shaft && <div className="tds-atmosphere__shaft" aria-hidden="true" />}
      {vignette && <div className="tds-atmosphere__vignette" aria-hidden="true" />}
      <div className="tds-atmosphere__content">{children}</div>
    </div>
  );
}
