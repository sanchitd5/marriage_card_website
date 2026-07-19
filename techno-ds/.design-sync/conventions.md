# techno-ds — how to build with it

Techno / Anyma-Afterlife skin for a Hindu wedding invitation. **Obsidian
monochrome, a single cyan light-source.** The page is black-and-white; light
(cyan) is rare and earned. Presence comes from weight, spacing and crisp edges,
not glow. A DJ-set metaphor runs through the copy ("Until the drop", "Track 01 /
Headline", waveform seams), alongside a Nataraja/Shiva shloka + crosshair-seal
motif.

## Wrapping and setup

- Import the stylesheet once at the app root: `import 'techno-ds/styles.css';`
- **Wrap every techno layout in `<TechnoProvider>`.** It establishes the obsidian
  ground (`--tds-bg` #0B0C0F), ice-white base text, the Space Grotesk body font,
  and the `data-skin="techno"` hook the `--tds-*` tokens live under. Without it,
  any custom layout glue you add has no obsidian background or base text colour
  and reads as unstyled boxes.
- Components resolve at `window.TechnoDS.*`.

```jsx
import { TechnoProvider, Band, Hero, Kicker, DisplayHead, EventCard, QuietButton } from 'techno-ds';
import 'techno-ds/styles.css';

<TechnoProvider as="main">
  <Hero
    names={['Sanchit', 'Riya']}
    shloka="तं नुमः सात्त्विकं शिवम् ॥"
    kicker="Dearest friends, we announce the union of"
    dateLine="11 & 12 December 2026 · Chandigarh & Ambala"
    hashtag="#SanchitKiRiya"
  />
  <Band tint>
    <Kicker>The running order</Kicker>
    <DisplayHead>Three sets, <em>two hearts</em></DisplayHead>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--tds-space-6)' }}>
      <EventCard track="Track 01" name="Haldi" when="Friday morning" venue="Radisson, Zirakpur"
        dressCode="Shades of yellow" actions={<QuietButton href="#">Get directions</QuietButton>} />
      <EventCard track="Headline" name="The Wedding" variant="headline" when="Saturday evening"
        venue="De'vansh Resort, Ambala Cantt" dressCode="Traditional grandeur" />
    </div>
  </Band>
</TechnoProvider>
```

## The styling idiom

**Compose the exported components — they carry all the styling.** Do not write
CSS class strings; there is no utility-class vocabulary to author against. For
your own layout glue (grids, spacing) use the `--tds-*` CSS custom properties;
never invent colours.

- Colour: `--tds-bg`, `--tds-bg-deep`, `--tds-surface` (grounds); `--tds-text`
  (primary ice-white), `--tds-body` (emotional copy), `--tds-muted`, `--tds-label`
  (mono labels); `--tds-hairline` (borders); `--tds-accent` (#22D3EE cyan).
- Type: `--tds-font-display` (Space Grotesk), `--tds-font-mono` (Space Mono),
  `--tds-font-deva` (Noto Serif Devanagari, sacred line only).
- Spacing: `--tds-space-1`, `-2`, `-3`, `-4`, `-6`, `-8`, `-12`.

**Two hard rules of the aesthetic:**
1. **Cyan is rare and earned — ~2-3 moments per screen, no bloom.** The hero
   ampersand, the sacred shloka, the headline event card's top-rule, a waveform
   tip. Never a per-heading highlight, never on body text.
2. **Heading emphasis is tonal, not coloured.** Wrap the emphasised words in
   `<em>` inside `ScriptHead`/`DisplayHead`/`Hero` — it renders in a lighter
   Space Grotesk weight, never a cyan or coloured highlight.

The sacred `Invocation` (Nataraja motif + Devanagari shloka) is always centred
and never animated or off-centre.

## Where the truth lives

- `techno-ds/styles.css` — tokens on `:root` (`--tds-*`), component classes
  (`.tds-*`). Read it before adding any custom styling.
- `components/<Name>/<Name>.prompt.md` — per-component usage + props.

## Components

Layout/ground: `TechnoProvider`, `Band`. Type: `Kicker`, `ScriptHead`,
`DisplayHead`, `WaveformDivider`, `NatarajaMotif`, `Invocation`. Composite:
`Hero`, `Countdown`, `EventCard` (+`QuietButton`), `ScratchReveal`, `GalleryVeil`,
`SealButton`, `Footer`.
