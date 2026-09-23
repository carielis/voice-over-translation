# Native extension boundaries

The page adapter runs in `MAIN` to access host player APIs. Treat its messages as
untrusted input: other scripts in that page can call the same bridge.

## Account credentials

The raw account token stays in background-managed extension storage. Both single
and bulk storage reads expose only public account fields and a non-secret marker.
Only the configured authentication server's `/auth/callback` may replace the
credential; `/my/profile` may update the username and avatar without replacing it.
The native extension uses the normal sign-in window, including when the token
login shortcut is selected. Manual token entry remains available to userscripts.
Signing out requires a real click on the extension's account button, checked in
the isolated bridge before the active account is removed. Expired accounts can
still be cleared automatically.

The background resolves the marker only for HTTPS POST requests to
`/video-translation/translate` at the Yandex API or the two built-in proxy origins.
Authenticated requests reject redirects. Custom proxies continue to support
anonymous translation but cannot receive the saved account token. Changing a
page-writable proxy setting never makes a new destination trusted.

Provider sessions remain in each page's memory. Their legacy persistent storage
key is not exposed through the native bridge. These anonymous session keys are
distinct from the account's OAuth credential.

This boundary prevents disclosure of the stored token. The page can still invoke
the permitted translation operation or change ordinary settings through its
bridge; preventing that requires moving the controlling UI out of `MAIN`.

## Network bridge

The service worker treats XHR messages from `MAIN` as untrusted. It accepts
same-origin requests from the calling page and a finite set of cross-origin
translation API routes, locale files, audio/subtitle resources, and supporting
media endpoints. Cross-origin requests omit browser credentials and redirects
are rejected. Other destinations and methods are rejected before `fetch`.
Custom proxy hosts are accepted when they match the configured host or a
supported proxy domain suffix, and only for translation API and media proxy
routes. They never receive the stored account credential. The page-world MSE
capture channel is separate from this XHR policy.

DNR rules are scoped to tabless requests initiated by the extension background
worker. Updates to mutable header rules are serialized through request dispatch,
so concurrent translations cannot exchange their forbidden-header values.

## Binary responses

Responses with unknown or large content lengths use progress chunks. Known small
responses can use one inline message. Stream readers release their locks on both
completion and failure.

## Verification

Run the focused tests and type checks:

```sh
bun test tests/extension-account-policy.test.ts tests/extension-storage-bridge.test.ts tests/extension-binary-response.test.ts tests/extension-request-policy.test.ts tests/extension-dnr-scope.test.ts tests/extension-logout-gesture.test.ts
bun run check
```

The tests use synthetic account values and responses and do not contact account
or translation services.
