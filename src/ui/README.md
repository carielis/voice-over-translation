# Studio interface

The player toolbar, quick menu, voice selector and settings share a graphite
surface with a mint translation accent. Live voices use a warm sand accent.
Tokens live in [main.scss](../styles/main.scss); component styles stay in
[styles/components](../styles/components). Fonts are local fallbacks, with no
additional font downloads. Subtitle text and karaoke colors retain independent
defaults.

## SVG artwork

[icons.ts](./icons.ts) contains inline SVG templates with rounded strokes and a
speech-wave motif. Decorative artwork is hidden from assistive technology; the
owning control supplies its accessible name. Preserve the translation/loading
IDs, download progress classes and voice bar classes when editing the artwork.
Line artwork puts `fill="none"` and `stroke="currentColor"` on an inner group so
shared control styles cannot accidentally fill its paths.

## Motion and layout

[motion.scss](../styles/components/motion.scss) adds brief panel entrances and
hover/press feedback. Only the visible loading indicator loops. Voice bars react
once on hover. New motion runs only with `prefers-reduced-motion: no-preference`;
the reduced-motion rule covers overlay roots, dialog portals and pseudo-elements.

Animate interior elements: toolbar transforms belong to docking/dragging and
popover positions are measured by the layout code. Keep hidden/inert semantics,
keyboard focus indicators and subtitle geometry intact. Menus and language
controls must fit the containing player, including narrow embedded players.

## Verification

Run `bun run check`, `bun run lint`, `bun test` and the userscript/extension
builds. Visually check default, loading, success and error states; all five dock
positions; language dialogs; keyboard focus; and narrow player layouts. Check
reduced motion with the operating system or browser accessibility preference.
