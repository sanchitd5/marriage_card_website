import * as React from 'react';

export interface TechnoProviderProps {
  /** Content styled with the techno design system. */
  children?: React.ReactNode;
  /** Render a different element (e.g. `"main"`, `"section"`). Default `"div"`. */
  as?: React.ElementType;
  /** Extra class names. */
  className?: string;
  /** Inline style overrides for the root. */
  style?: React.CSSProperties;
}

/**
 * Root wrapper for the techno skin. Establishes the obsidian ground, ice-white
 * base text, Space Grotesk body font, and the `data-skin="techno"` hook that the
 * design-system CSS variables live under. Wrap any techno layout in this so
 * tokens and fonts resolve.
 */
export function TechnoProvider({ children, as, className, style }: TechnoProviderProps) {
  const Tag = as || 'div';
  return (
    <Tag
      data-skin="techno"
      className={['tds-root', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </Tag>
  );
}
