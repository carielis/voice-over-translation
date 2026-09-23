Contains the implementation for extracting the audio track from a YouTube video to send it to Yandex. Used only when the server explicitly requests audio.

Implemented:

- `web_abr`
- `web_mse_proxy`

The MSE fallback cannot verify or choose an audio language in YouTube's embed
player. When a specific source language is selected, it fails instead of
uploading a potentially different audio track. `web_abr` remains the primary
path for language-specific audio. MSE capture is available for `auto`.

The downloader keeps one completed audio source for retries after a failed upload.
The cache key includes the video ID and normalized source language (case,
surrounding whitespace, and `_`/`-` differences are ignored). Changing the source
language downloads audio again. Downloads and cache replays are serialized per
video, including requests from different downloader instances.

Upload retries skip confirmed chunks only for the same video, source language,
and file ID. Changing the video or source language aborts an ongoing preparation
and starts a new upload from the first chunk. Successful uploads clear the cache.
