import * as React from 'react';

export interface ScriptHeadProps {
  /** Heading text. */
  children?: React.ReactNode;
  /** Heading level for semantics. Default `2`. */
  level?: 1 | 2 | 3;
  className?: string;
}

/**
 * The system's primary display heading — Space Grotesk 600, large clamp, tight
 * tracking. Used for section titles like "Until the drop".
 */
export function ScriptHead({ children, level = 2, className }: ScriptHeadProps) {
  const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3';
  return <Tag className={['tds-script-head', className].filter(Boolean).join(' ')}>{children}</Tag>;
}

export interface DisplayHeadProps {
  /** Heading text. Wrap tonal emphasis in a `<em>` — it renders as a lighter
   *  weight (not a cyan highlight). */
  children?: React.ReactNode;
  /** Heading level for semantics. Default `2`. */
  level?: 1 | 2 | 3;
  className?: string;
}

/**
 * Display heading with tonal (weight) emphasis. Any `<em>` inside renders in a
 * lighter Space Grotesk weight — the system never uses colour to emphasise a
 * heading. Used for two-part titles like "The story <em>so far</em>".
 */
export function DisplayHead({ children, level = 2, className }: DisplayHeadProps) {
  const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3';
  return <Tag className={['tds-display-head', className].filter(Boolean).join(' ')}>{children}</Tag>;
}
