import { svg } from "lit-html";

// Keep line styling on an inner group: host-page resets may override the SVG root.
export const TRANSLATE_ICON_SVG = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <g id="vot-translate-icon">
      <path d="M7 4h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H9l-5 2v-4a4 4 0 0 1-1-2V8a4 4 0 0 1 4-4Z"/>
      <path d="M7 10v3m3-5v7m3-8v9m3-6v3"/>
    </g>
    <g id="vot-loading-icon" style="display:none">
      <path d="M6 4.8A8.5 8.5 0 0 1 20.5 11M18 19.2A8.5 8.5 0 0 1 3.5 13" opacity="0.45"/>
      <path class="vot-studio-wave-bar" d="M6 10v4"/>
      <path class="vot-studio-wave-bar" d="M10 7v10"/>
      <path class="vot-studio-wave-bar" d="M14 8v8"/>
      <path class="vot-studio-wave-bar" d="M18 10v4"/>
    </g>
  </g>
</svg>`;

export const PIP_ICON_SVG = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 20H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2M6 8l4 4m-4 0h4V8"/>
    <rect x="13" y="12" width="9" height="8" rx="2"/>
  </g>
</svg>`;

export const MENU_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="1.75"/>
    <circle cx="12" cy="12" r="1.75"/>
    <circle cx="12" cy="19" r="1.75"/>
  </g>
</svg>`;

export const DOWNLOAD_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="vot-loader" id="vot-loader-download" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path class="vot-loader-main" d="M12 3v12m-4-4 4 4 4-4M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"/>
    <circle class="vot-loader-progress" cx="12" cy="12" r="9"/>
  </g>
</svg>`;

export const SUBTITLES_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.5" y="4.5" width="19" height="15" rx="3"/>
    <path d="M6.5 10h3m3 0h5m-11 5h7m3 0h1"/>
  </g>
</svg>`;

export const SETTINGS_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 3v3m0 4v11m7-18v11m0 4v3m7-18v5m0 4v9"/>
    <rect x="3" y="6" width="4" height="4" rx="1.5"/>
    <rect x="10" y="14" width="4" height="4" rx="1.5"/>
    <rect x="17" y="8" width="4" height="4" rx="1.5"/>
  </g>
</svg>`;

export const CHEVRON_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="m7 10 5 5 5-5"/>
  </g>
</svg>`;

export const ARROW_RIGHT_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12h16m-6-6 6 6-6 6"/>
  </g>
</svg>`;

export const CLOSE_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="m6 6 12 12M18 6 6 18"/>
  </g>
</svg>`;

export const WARNING_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.3 4.1a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3Z"/>
    <path d="M12 8.5V13m0 3.5h0"/>
  </g>
</svg>`;

export const HELP_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .5-1.5 1-1.5 2.4m0 3h0"/>
  </g>
</svg>`;

export const REFRESH_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 5v5h-5M4 19v-5h5"/>
    <path d="M4.5 9a8 8 0 0 1 13.2-3.7L20 8M4 16l2.3 2.7A8 8 0 0 0 19.5 15"/>
  </g>
</svg>`;

export const KEY_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15.8 13a6 6 0 1 0-4.8-4.8L3 16.3V21h4.7v-3.3H11v-3.3Z"/>
    <circle cx="17" cy="7" r="1"/>
  </g>
</svg>`;

/** Three rounded bars; animation is controlled by the voice picker state. */
export const STANDARD_VOICE_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" class="vot-voice-icon vot-voice-icon--standard" aria-hidden="true" focusable="false">
  <g fill="currentColor" stroke="none">
    <rect class="vot-eq-bar vot-eq-bar--1" x="3" y="10" width="2.5" height="7" rx="1.25"/>
    <rect class="vot-eq-bar vot-eq-bar--2" x="8.75" y="5" width="2.5" height="12" rx="1.25"/>
    <rect class="vot-eq-bar vot-eq-bar--3" x="14.5" y="10" width="2.5" height="7" rx="1.25"/>
  </g>
</svg>`;

/** Five bars distinguish live voices even without color or motion. */
export const LIVE_VOICE_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" class="vot-voice-icon vot-voice-icon--live" aria-hidden="true" focusable="false">
  <g fill="currentColor" stroke="none">
    <rect class="vot-eq-bar vot-eq-bar--1" x="1.5" y="12" width="2" height="5" rx="1"/>
    <rect class="vot-eq-bar vot-eq-bar--2" x="5.25" y="8" width="2" height="9" rx="1"/>
    <rect class="vot-eq-bar vot-eq-bar--3" x="9" y="3" width="2" height="14" rx="1"/>
    <rect class="vot-eq-bar vot-eq-bar--4" x="12.75" y="8" width="2" height="9" rx="1"/>
    <rect class="vot-eq-bar vot-eq-bar--5" x="16.5" y="12" width="2" height="5" rx="1"/>
  </g>
</svg>`;

/** Static waveform signature for the studio header. */
export const STUDIO_WAVE_ICON = svg`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="24" viewBox="0 0 64 24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
    <path d="M2 11v2m5-4v6m5-7v8m5-12v16m5-13v10m5-7v4m5-9v14m5-17v20m5-16v12m5-9v6m5-7v8m5-6v4m5-3v2"/>
  </g>
</svg>`;
