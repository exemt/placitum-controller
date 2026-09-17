const ENVELOPE_VERSION = 0x01;
const NONCE_SIZE = 12;

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);

  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function importContourPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToDer(pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

export async function sealPem(
  plaintext: string,
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  const dek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const rawDek = new Uint8Array(await crypto.subtle.exportKey("raw", dek));

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, dek, plaintextBytes),
  );

  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawDek),
  );

  if (wrapped.length > 0xffff) {
    throw new Error("wrapped dek does not fit envelope header");
  }

  const header = new Uint8Array(3);
  header[0] = ENVELOPE_VERSION;
  header[1] = (wrapped.length >> 8) & 0xff;
  header[2] = wrapped.length & 0xff;

  return concatBytes(header, wrapped, nonce, ciphertext);
}

export async function sealPemToBase64(
  plaintext: string,
  publicKey: CryptoKey,
): Promise<string> {
  return toBase64(await sealPem(plaintext, publicKey));
}

export type FingerprintCheck = "match" | "mismatch" | "no_pin";

// The installation writes the key fingerprint next to the panel files; the API never sets it.
// A pin that fails to load blocks sealing instead of turning into no_pin.
let pin: Promise<string> | null = null;

function contourPin(): Promise<string> {
  pin ??= fetch("/contour-pin.json", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`contour-pin.json: ${res.status}`);
      }
      const body: unknown = await res.json();
      const value = (body as { fingerprint?: unknown } | null)?.fingerprint;
      if (typeof value !== "string") {
        throw new Error("contour-pin.json: no fingerprint");
      }
      return value;
    })
    .catch((err: unknown) => {
      pin = null;
      throw err;
    });
  return pin;
}

export async function checkFingerprint(fingerprint: string): Promise<FingerprintCheck> {
  const pinned = await contourPin();
  if (pinned === "") {
    return "no_pin";
  }
  return pinned === fingerprint ? "match" : "mismatch";
}
