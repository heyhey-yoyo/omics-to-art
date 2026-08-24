const DEFAULT_TOKEN_TTL_SECONDS = 60 * 30;

export async function signProxyUrl(
  url: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ u: url, exp: nowSeconds + ttlSeconds })));
  const signature = await hmac(payload, secret);
  // A dot is not part of the base64url alphabet, so token splitting is unambiguous.
  return `${payload}.${signature}`;
}

export async function verifyProxyToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const separator = token.lastIndexOf(".");
  if (separator < 1 || separator === token.length - 1) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmac(payload, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { u?: unknown; exp?: unknown };
    if (typeof decoded.u !== "string" || typeof decoded.exp !== "number" || decoded.exp < nowSeconds) return null;
    return decoded.u;
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(bytes));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
