import debug from "../../utils/debug";
import { dnrUpdateSessionRules, ext } from "../shared/webext";
import {
  filterYandexHeadersForDnr,
  isYandexApiHostname,
  normalizeHeaderName,
  SUPPRESSED_UA_CH_HEADERS,
} from "../shared/yandexHeaders";

const DNR_RULE_ID_YANDEX_HEADERS = 9001;
const DNR_RULE_ID_YOUTUBEI_ORIGIN = 9002;
const DNR_RULE_ID_GOOGLEVIDEO_HEADERS = 9003;
const dnrAppliedSignatures = new Map<number, string>();
let dnrRuleUpdateQueue: Promise<void> = Promise.resolve();
let dnrRequestQueue: Promise<void> = Promise.resolve();

type DnrRequestHeaderRemove = { header: string; operation: "remove" };
type DnrRequestHeaderSet = { header: string; operation: "set"; value: string };
type DnrRequestHeader = DnrRequestHeaderRemove | DnrRequestHeaderSet;

const YOUTUBEI_BASE_HEADERS: DnrRequestHeader[] = [
  { header: "Origin", operation: "remove" },
  { header: "x-client-data", operation: "remove" },
  { header: "x-goog-visitor-id", operation: "remove" },
];
const GOOGLEVIDEO_BASE_HEADERS: DnrRequestHeader[] = [
  { header: "x-client-data", operation: "remove" },
];

function hasDnr(): boolean {
  return Boolean(ext?.declarativeNetRequest?.updateSessionRules);
}

export function getExtensionDnrRequestScope(extensionUrl: string): {
  tabIds: number[];
  initiatorDomains: string[];
} {
  const url = new URL(extensionUrl);
  if (!url.hostname || !["chrome-extension:", "moz-extension:"].includes(url.protocol)) {
    throw new Error("Missing extension origin for DNR rule");
  }
  // Background service worker fetches have no tab. The initiator additionally
  // excludes unrelated tabless requests from other extensions.
  return { tabIds: [-1], initiatorDomains: [url.hostname] };
}

function currentRequestScope() {
  return getExtensionDnrRequestScope(ext?.runtime?.getURL?.("") ?? "");
}

/** Keep mutable header rules stable until fetch has dispatched and received headers. */
export async function withDnrRequestLock<T>(
  url: string,
  run: () => Promise<T>,
): Promise<T> {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return await run();
  }
  if (
    !isYandexApiHostname(hostname) &&
    !isYoutubeMobileUrl(url) &&
    !isGooglevideoUrl(url)
  ) {
    return await run();
  }
  const previous = dnrRequestQueue;
  let release!: () => void;
  dnrRequestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await run();
  } finally {
    release();
  }
}

async function updateSessionRules(args: {
  addRules?: unknown[];
  removeRuleIds?: number[];
}): Promise<void> {
  await dnrUpdateSessionRules(args);
}

const FORBIDDEN_HEADERS = new Set(["user-agent", "origin", "referer"]);

export function isForbiddenToSetViaFetch(headerName: string): boolean {
  const n = headerName.trim().toLowerCase();
  return (
    n.startsWith("sec-") || n.startsWith("proxy-") || FORBIDDEN_HEADERS.has(n)
  );
}

function signatureFromDnrRequestHeaders(
  requestHeaders: readonly DnrRequestHeader[],
): string {
  const entries = requestHeaders
    .map(
      (h) =>
        [
          `${normalizeHeaderName(String(h.header)).toLowerCase()}:${String(h.operation)}`,
          String("value" in h ? h.value : ""),
        ] as const,
    )
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

async function queueDnrSessionRuleUpdate(
  ruleId: number,
  signature: string,
  rule: unknown,
): Promise<boolean> {
  if (signature === dnrAppliedSignatures.get(ruleId)) {
    return false;
  }

  const prev = dnrRuleUpdateQueue;
  let releaseNext!: () => void;
  dnrRuleUpdateQueue = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });

  try {
    await prev;
  } catch {
    // Previous update failed; continue with next in queue.
  }

  try {
    if (signature !== dnrAppliedSignatures.get(ruleId)) {
      await updateSessionRules({ removeRuleIds: [ruleId], addRules: [rule] });
      dnrAppliedSignatures.set(ruleId, signature);
    }
    return true;
  } finally {
    releaseNext();
  }
}

export async function ensureDnrHeaderRuleForYandex(
  url: string,
  forbiddenHeaders: Record<string, string>,
): Promise<void> {
  if (!hasDnr()) return;

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  if (!isYandexApiHostname(hostname)) return;

  const requestHeaders: DnrRequestHeader[] = [
    { header: "Origin", operation: "remove" },
    { header: "Referer", operation: "remove" },
    ...SUPPRESSED_UA_CH_HEADERS.map(
      (h): DnrRequestHeaderRemove => ({ header: h, operation: "remove" }),
    ),
  ];

  for (const [header, value] of Object.entries(
    filterYandexHeadersForDnr(forbiddenHeaders),
  )) {
    requestHeaders.push({
      header: normalizeHeaderName(header),
      operation: "set",
      value: String(value),
    });
  }

  const signature = signatureFromDnrRequestHeaders(requestHeaders);
  const rule = {
    id: DNR_RULE_ID_YANDEX_HEADERS,
    priority: 1,
    action: { type: "modifyHeaders", requestHeaders },
    condition: {
      urlFilter: "|https://api.browser.yandex.ru/",
      resourceTypes: ["xmlhttprequest"],
      ...currentRequestScope(),
    },
  };

  await queueDnrSessionRuleUpdate(DNR_RULE_ID_YANDEX_HEADERS, signature, rule);
}

function isYoutubeMobileUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.toLowerCase() === "m.youtube.com";
  } catch {
    return false;
  }
}

function isGooglevideoUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return (
      protocol === "https:" &&
      (host === "googlevideo.com" || host.endsWith(".googlevideo.com"))
    );
  } catch {
    return false;
  }
}

async function ensureDnrHeaderStripRule(
  url: string,
  isTargetUrl: (url: string) => boolean,
  ruleId: number,
  requestHeaders: DnrRequestHeader[],
  urlFilter: string,
): Promise<boolean> {
  if (!hasDnr() || !isTargetUrl(url)) return false;

  const signature = signatureFromDnrRequestHeaders(requestHeaders);
  const rule = {
    id: ruleId,
    priority: 1,
    action: { type: "modifyHeaders", requestHeaders },
    condition: {
      urlFilter,
      resourceTypes: ["xmlhttprequest"],
      ...currentRequestScope(),
    },
  };

  debug.log("[VOT EXT][background][dnr] applying rule", {
    ruleId,
    urlFilter,
    headerOps: requestHeaders.map((h) => `${h.operation}:${h.header}`),
    isDuplicate: signature === dnrAppliedSignatures.get(ruleId),
  });

  const isNew = await queueDnrSessionRuleUpdate(ruleId, signature, rule);
  debug.log("[VOT EXT][background][dnr] rule applied", { ruleId, isNew });
  return isNew;
}

export async function ensureDnrOriginStripRuleForYoutubei(
  url: string,
  forbiddenHeaders: Record<string, string> = {},
): Promise<boolean> {
  if (!isYoutubeMobileUrl(url)) return false;

  const requestHeaders: DnrRequestHeader[] = [...YOUTUBEI_BASE_HEADERS];

  for (const [header, value] of Object.entries(forbiddenHeaders)) {
    const name = normalizeHeaderName(header);
    if (!name || name.toLowerCase() === "origin") continue;
    requestHeaders.push({
      header: name,
      operation: "set",
      value: String(value),
    });
  }

  return ensureDnrHeaderStripRule(
    url,
    isYoutubeMobileUrl,
    DNR_RULE_ID_YOUTUBEI_ORIGIN,
    requestHeaders,
    "||m.youtube.com/",
  );
}

export async function ensureDnrStripRuleForGooglevideo(
  url: string,
  forbiddenHeaders: Record<string, string> = {},
): Promise<boolean> {
  if (!isGooglevideoUrl(url)) return false;

  const requestHeaders: DnrRequestHeader[] = [...GOOGLEVIDEO_BASE_HEADERS];

  for (const [header, value] of Object.entries(forbiddenHeaders)) {
    const name = normalizeHeaderName(header);
    if (!name || name.toLowerCase() === "origin") continue;
    requestHeaders.push({
      header: name,
      operation: "set",
      value: String(value),
    });
  }

  return ensureDnrHeaderStripRule(
    url,
    isGooglevideoUrl,
    DNR_RULE_ID_GOOGLEVIDEO_HEADERS,
    requestHeaders,
    "||googlevideo.com/",
  );
}

export async function preseedDnrRules(): Promise<void> {
  if (!hasDnr()) return;
  const previous = dnrRuleUpdateQueue;
  let release!: () => void;
  dnrRuleUpdateQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    // Remove broad session rules left by an earlier extension version. New
    // scoped rules are installed only for requests that actually need them.
    await updateSessionRules({
      removeRuleIds: [
        DNR_RULE_ID_YANDEX_HEADERS,
        DNR_RULE_ID_YOUTUBEI_ORIGIN,
        DNR_RULE_ID_GOOGLEVIDEO_HEADERS,
      ],
    });
    dnrAppliedSignatures.clear();
    debug.log("[VOT EXT][background] stale DNR rules removed");
  } catch (e) {
    debug.warn("[VOT EXT][background] Failed to remove stale DNR rules:", e);
  } finally {
    release();
  }
}
