# Techno invitation — page structure

The canonical single-page order, top to bottom. Compose it inside one
`<TechnoProvider>`; wrap the hero (and optionally the interlude) in `<Atmosphere>`
for depth.

1. **Gate** (optional intro) — `Atmosphere` + `Invocation` (shloka) + `SealButton`.
   The guest taps the seal to enter.
2. **Hero** — `Hero` inside `Atmosphere`. Names at full display scale, one cyan
   ampersand, shloka, invitational kicker, `WaveformDivider`, hashtag. Centered.
3. **Countdown** — `SectionHeader` ("Until the drop") + `Countdown` +
   `ScratchReveal` (the date, hidden under foil). Desktop: countdown and scratch
   card side by side.
4. **Events** — `SectionHeader` ("Three sets, two hearts", left-anchored) + a
   3-column grid of `EventCard`. The wedding is the `variant="headline"` card
   (wider / lifted). Each card carries `QuietButton` actions.
5. **Interlude** — `Interlude`: the cyan-duotone portrait bleeding to one edge,
   the pull-quote opposite. The story beat.
6. **Gallery** — `SectionHeader` ("The story so far") + either `GalleryVeil`
   (before the celebration) or `Gallery` (the revealed masonry, after).
7. **Footer** — `Footer`. The hand-signed close: shloka, cyan monogram, message,
   sign-off, hashtag. Centered and warm.

## Rhythm
- Alternate `Band tint` on/off between sections.
- Left-anchor informational section headers (countdown, events, gallery); keep
  the hero, interlude quote, and footer centered.
- Full-height hero; size the informational bands to their content.
