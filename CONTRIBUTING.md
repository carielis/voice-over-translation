[localize-link]: https://github.com/ilyhalight/localize/tree/master/packages/localize-tui
[votjs-link]: https://github.com/FOSWLY/vot.js

# Contributing guide

If possible, all new code **SHOULD BE** written with TypeScript. **AVOID** comits of files from `dist` folder.

## Testing

Use Node.js 22 and Bun 1.4.2, matching CI. Install dependencies from the committed
`bun.lock`, then run the checks before submitting a change:

```bash
bun install --frozen-lockfile
bun run test
bun run check
bun run lint
```

`test` runs the unit tests, `check` checks the build configuration and application
types, and `lint` checks the source, build configuration, and scripts. CI requires
all three checks to pass before building userscripts and browser extensions.
Node.js builds also install dependencies with Bun to use the same lockfile.

For changes affecting a build, also run the relevant command:

```bash
npm run build:gm
npm run build:ext
```

## localization

All phrases **MUST BE** added to the `Phrase` and `Phrases` types in [localization.ts](./src/types/localization.ts).

It's **RECOMMENDED** to automatically generate all the necessary phrases and types using the [localize][localize-link] script.

In this project, it's available using:

```bash
bun localize
```

or

```bash
npm localize
```

You can change the translation service in the [l10n.config.json](./l10n.config.json), but you **SHOULD NOT** commit it.

If you are editing the translation manually, then you **MUST** update the hash using [localize][localize-link] script.

![example](https://github.com/user-attachments/assets/2fcd3f70-aee6-4b45-827e-2fbe0d2cf599)

## vot.js

**DON'T forget** to pass `{ fetchFn: GM_fetch }` option to `getVideoID` and `getVideoData`

### Adding support for new sites

To add support for a new sites, you need make neaccessary changes in [vot.js][votjs-link] and then add domain to match list in [headers.json](./src/headers.json).

Also, **DON'T forget** to add new paths to the [wiki data](./scripts/wiki-gen/data.js). This doesn't affect the functionality of the extension, but it is better to keep the wiki up to date.
