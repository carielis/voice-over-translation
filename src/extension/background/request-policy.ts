import {
  detectRustServerUrl,
  foswlyTranslateUrl,
  proxyWorkerHost,
  proxyWorkerHostMode1,
  workerHost,
} from "../../config/config";

type RequestPolicy = {
  credentials: RequestCredentials;
  redirect: RequestRedirect;
};

const YANDEX_API_PATHS = new Map<string, ReadonlySet<string>>([
  ["/session/create", new Set(["POST"])],
  ["/video-translation/translate", new Set(["POST"])],
  ["/video-translation/fail-audio-js", new Set(["PUT"])],
  ["/video-translation/audio", new Set(["PUT"])],
  ["/video-translation/cache", new Set(["POST"])],
  ["/video-subtitles/get-subtitles", new Set(["POST"])],
  ["/stream-translation/ping-stream", new Set(["POST"])],
  ["/stream-translation/translate-stream", new Set(["POST"])],
]);
const PROXY_API_PATHS = YANDEX_API_PATHS;
const BUILTIN_PROXY_HOSTS = new Set([
  proxyWorkerHost,
  proxyWorkerHostMode1,
]);
const PROXY_HOST_SUFFIXES = [".eu.cc", ".workers.dev", ".toil.cc"];
const SITE_MEDIA_HOSTS = ["youtube.com", "vimeo.com", "porntn.com"];

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isProxyHost(url: URL, configuredProxyHost: unknown): boolean {
  const { hostname } = url;
  let configuredHost = "";
  if (typeof configuredProxyHost === "string") {
    try {
      const configured = new URL(`https://${configuredProxyHost}`);
      if (!configured.username && !configured.password && configured.pathname === "/") {
        configuredHost = configured.host;
      }
    } catch {
      // Ignore malformed page-writable proxy settings.
    }
  }
  return (
    (configuredHost !== "" && url.host === configuredHost) ||
    BUILTIN_PROXY_HOSTS.has(hostname) ||
    PROXY_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function isAllowedPublicEndpoint(
  url: URL,
  method: string,
  sender: URL,
  configuredProxyHost: unknown,
): boolean {
  const { hostname, pathname } = url;
  const foswly = new URL(foswlyTranslateUrl);
  if (url.origin === foswly.origin && pathname.startsWith(`${foswly.pathname}/`)) {
    return (
      (pathname === `${foswly.pathname}/translate` && ["GET", "POST"].includes(method)) ||
      (pathname === `${foswly.pathname}/detect` && method === "GET")
    );
  }
  const detect = new URL(detectRustServerUrl);
  if (url.origin === detect.origin) {
    return pathname === detect.pathname && method === "POST";
  }
  if (hostname === workerHost) {
    return !url.search && (YANDEX_API_PATHS.get(pathname)?.has(method) ?? false);
  }
  if (isProxyHost(url, configuredProxyHost)) {
    return (
      (!url.search && PROXY_API_PATHS.get(pathname)?.has(method) === true) ||
      (method === "GET" &&
        (pathname.startsWith("/video-translation/audio-proxy/") ||
          pathname.startsWith("/video-subtitles/subtitles-proxy/")))
    );
  }
  if (method === "GET" || method === "HEAD") {
    if (
      SITE_MEDIA_HOSTS.some(
        (domain) =>
          isHostOrSubdomain(sender.hostname, domain) &&
          isHostOrSubdomain(hostname, domain),
      )
    ) {
      return true;
    }
    if (hostname === "vtrans.s3-private.mds.yandex.net") {
      return pathname.startsWith("/tts/prod/");
    }
    if (hostname === "brosubs.s3-private.mds.yandex.net") {
      return pathname.startsWith("/vtrans/");
    }
    if (hostname === "raw.githubusercontent.com") {
      return /^\/ilyhalight\/voice-over-translation\/[^/]+\/src\/localization\/(?:hashes\.json|locales\/[^/]+\.json)$/.test(
        pathname,
      );
    }
    if (hostname === "cloudflare-dns.com") {
      return pathname === "/cdn-cgi/trace";
    }
    if (hostname === "googlevideo.com" || hostname.endsWith(".googlevideo.com")) {
      return true;
    }
    if (hostname === "api.vimeo.com") {
      return pathname.startsWith("/videos/");
    }
    if (hostname === "fonts.googleapis.com") {
      return pathname === "/css2";
    }
    if (hostname === "fonts.google.com") {
      return pathname === "/metadata/fonts";
    }
    if (hostname === "www.youtube.com") {
      return pathname.startsWith("/api/timedtext");
    }
  }
  if (hostname === "m.youtube.com" && method === "POST") {
    return pathname.startsWith("/youtubei/v1/");
  }
  return false;
}

/**
 * Page-world messages are not authenticated. Keep cross-origin requests to
 * operations needed by the extension, and never send browser cookies there.
 */
export function resolveRequestPolicy(
  requestUrl: unknown,
  method: unknown,
  senderUrl: unknown,
  configuredProxyHost?: unknown,
): RequestPolicy {
  let target: URL;
  let sender: URL;
  try {
    target = new URL(String(requestUrl));
    sender = new URL(String(senderUrl));
  } catch {
    throw new Error("Unsupported extension request destination");
  }

  const normalizedMethod = String(method || "GET").toUpperCase();
  if (
    !["http:", "https:"].includes(sender.protocol) ||
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)
  ) {
    throw new Error("Unsupported extension request destination");
  }

  if (target.origin === sender.origin) {
    return { credentials: "include", redirect: "error" };
  }

  if (
    target.protocol !== "https:" ||
    !isAllowedPublicEndpoint(
      target,
      normalizedMethod,
      sender,
      configuredProxyHost,
    )
  ) {
    throw new Error("Unsupported extension request destination");
  }

  return { credentials: "omit", redirect: "error" };
}
