import {
  authServerUrl,
  proxyWorkerHost,
  proxyWorkerHostMode1,
  workerHost,
} from "../../config/config";

// This public capability marker is never a bearer credential. The background
// resolves it only for the fixed translation endpoints below.
export const PUBLIC_ACCOUNT_TOKEN = "__VOT_EXTENSION_ACCOUNT__";

export type PublicAccount = {
  username?: string;
  avatarId?: string;
  expires?: number;
  token?: string;
};

export type StoredAccount = PublicAccount & { token: string; expires: number };

type AuthenticatedRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
};

type PreparedAuthenticatedRequest = {
  headers: Record<string, string>;
  authenticated: boolean;
  redirect?: "error";
};

const TRANSLATION_PATH = "/video-translation/translate";
const DIRECT_ORIGIN = `https://${workerHost}`;
const PROXY_ORIGINS = new Set([
  `https://${proxyWorkerHost}`,
  `https://${proxyWorkerHostMode1}`,
]);
const PUBLIC_AUTHORIZATION = `OAuth ${PUBLIC_ACCOUNT_TOKEN}`;
const MAX_WRAPPED_HEADERS_LENGTH = 64 * 1024;
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== PUBLIC_ACCOUNT_TOKEN &&
    /^[!-~]+$/.test(value)
  );
}

function accountFields(value: unknown): StoredAccount | undefined {
  if (!isRecord(value)) return undefined;
  const token = ownValue(value, "token");
  const expires = ownValue(value, "expires");
  if (
    !isCredential(token) ||
    typeof expires !== "number" ||
    !Number.isFinite(expires) ||
    expires <= 0
  ) {
    return undefined;
  }
  const account: StoredAccount = { token, expires };
  for (const field of ["username", "avatarId"] as const) {
    const item = ownValue(value, field);
    if (typeof item === "string") account[field] = item;
  }
  return account;
}

export function sanitizePublicAccount(value: unknown): PublicAccount {
  const account = accountFields(value);
  if (!account) return {};
  return { ...account, token: PUBLIC_ACCOUNT_TOKEN };
}

export function prepareAccountWrite(
  value: unknown,
  currentAccount: unknown,
  senderUrl: unknown,
): StoredAccount {
  let url: URL;
  try {
    url = new URL(typeof senderUrl === "string" ? senderUrl : "");
  } catch {
    throw new Error("Account updates require the trusted sign-in page");
  }
  if (
    url.origin !== authServerUrl ||
    url.username ||
    url.password ||
    !isRecord(value)
  ) {
    throw new Error("Account updates require the trusted sign-in page");
  }

  if (url.pathname === "/auth/callback") {
    const account = accountFields(value);
    if (!account) throw new Error("Invalid sign-in credentials");
    return { token: account.token, expires: account.expires };
  }

  if (url.pathname === "/my/profile") {
    const current = accountFields(currentAccount);
    const username = ownValue(value, "username");
    const avatarId = ownValue(value, "avatarId");
    if (
      !current ||
      typeof username !== "string" ||
      !username ||
      typeof avatarId !== "string" ||
      !avatarId
    ) {
      throw new Error("Invalid account profile update");
    }
    return { ...current, username, avatarId };
  }

  throw new Error("Account updates require the trusted sign-in page");
}

function readHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error("Invalid request headers");
  const entries = Object.entries(value);
  const seen = new Set<string>();
  for (const [name, item] of entries) {
    const normalizedName = name.toLowerCase();
    if (
      typeof item !== "string" ||
      name !== name.trim() ||
      seen.has(normalizedName)
    ) {
      throw new Error("Invalid or ambiguous request headers");
    }
    seen.add(normalizedName);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function findHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  return Object.keys(headers).find((key) => key.toLowerCase() === name);
}

function decodeWrappedHeaders(value: string): Record<string, string> {
  if (
    !value ||
    value.length > MAX_WRAPPED_HEADERS_LENGTH ||
    !BASE64_RE.test(value)
  ) {
    throw new Error("Invalid proxy request headers");
  }
  try {
    const headers = readHeaders(JSON.parse(atob(value)));
    if (findHeader(headers, "x-vot-headers")) {
      throw new Error("Nested proxy headers are not supported");
    }
    return headers;
  } catch {
    throw new Error("Invalid proxy request headers");
  }
}

function hasCredentialMarker(headers: Record<string, string>): boolean {
  return Object.values(headers).some((value) =>
    value.includes(PUBLIC_ACCOUNT_TOKEN),
  );
}

export function hasAccountTokenPlaceholder(
  requestHeaders: Record<string, string>,
): boolean {
  const headers = readHeaders(requestHeaders);
  const wrapperKey = findHeader(headers, "x-vot-headers");
  const wrappedHeaders = wrapperKey
    ? decodeWrappedHeaders(headers[wrapperKey])
    : undefined;
  return (
    hasCredentialMarker(headers) ||
    (wrappedHeaders !== undefined && hasCredentialMarker(wrappedHeaders))
  );
}

export function prepareAuthenticatedRequest(
  request: AuthenticatedRequest,
  storedAccount: unknown,
): PreparedAuthenticatedRequest {
  const headers = readHeaders(request.headers ?? {});
  const authorizationKey = findHeader(headers, "authorization");
  const wrapperKey = findHeader(headers, "x-vot-headers");
  const wrappedHeaders = wrapperKey
    ? decodeWrappedHeaders(headers[wrapperKey])
    : undefined;
  const wrappedAuthorizationKey = wrappedHeaders
    ? findHeader(wrappedHeaders, "authorization")
    : undefined;
  const directMarker = hasCredentialMarker(headers);
  const wrappedMarker = wrappedHeaders
    ? hasCredentialMarker(wrappedHeaders)
    : false;

  if (!directMarker && !wrappedMarker) {
    return { headers, authenticated: false };
  }

  const directAuth =
    directMarker &&
    !wrapperKey &&
    authorizationKey !== undefined &&
    headers[authorizationKey] === PUBLIC_AUTHORIZATION;
  const proxyAuth =
    !directMarker &&
    !authorizationKey &&
    wrappedMarker &&
    wrappedAuthorizationKey !== undefined &&
    wrappedHeaders?.[wrappedAuthorizationKey] === PUBLIC_AUTHORIZATION;
  const credentialHeaders = directAuth ? headers : wrappedHeaders;
  const credentialKey = directAuth ? authorizationKey : wrappedAuthorizationKey;
  if (
    (!directAuth && !proxyAuth) ||
    !credentialHeaders ||
    !credentialKey ||
    Object.entries(credentialHeaders).some(
      ([key, value]) =>
        key !== credentialKey && value.includes(PUBLIC_ACCOUNT_TOKEN),
    )
  ) {
    throw new Error("Invalid or ambiguous account credential marker");
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new Error("Unsupported authenticated translation destination");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== TRANSLATION_PATH ||
    (request.method ?? "GET").toUpperCase() !== "POST" ||
    (directAuth ? url.origin !== DIRECT_ORIGIN : !PROXY_ORIGINS.has(url.origin))
  ) {
    throw new Error("Unsupported authenticated translation destination");
  }

  const account = accountFields(storedAccount);
  if (!account || account.expires <= Date.now()) {
    throw new Error("Sign in again to use authenticated translation");
  }

  credentialHeaders[credentialKey] = `OAuth ${account.token}`;
  if (proxyAuth && wrapperKey) {
    headers[wrapperKey] = btoa(JSON.stringify(credentialHeaders));
  }
  return { headers, authenticated: true, redirect: "error" };
}
