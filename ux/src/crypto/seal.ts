/*
 * Шифрование сертификата и ключа в браузере перед отправкой на контроллер.
 * Формат конверта -- docs/config-distribution.md#формат-blob, тот же, что
 * открывает crypto-сервис (docs/crypto-service.md). Контроллер получает
 * только результат `sealPem`, plaintext PEM никуда, кроме этого модуля, не
 * попадает.
 *
 * Гибридная схема: случайный AES-256 DEK шифрует PEM (AES-256-GCM), сам DEK
 * оборачивается публичным ключом контура (RSA-OAEP-SHA256). WebCrypto -- не
 * Node crypto: этот файл выполняется только в браузере.
 */

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

/** base64 без переводов строк -- то, что ждёт `POST /api/:scope/store` в поле `blob`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Импортирует публичный ключ контура (SPKI PEM) для RSA-OAEP-SHA256. */
export async function importContourPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToDer(pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

/**
 * Шифрует PEM (сертификат, ключ или chain) в конверт store-объекта.
 * Каждый вызов -- свой случайный DEK и nonce: объекты store независимы,
 * компрометация одного не открывает соседние.
 */
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
    // RSA-4096-OAEP оборачивает в постоянные 512 байт; это защита от будущей
    // смены алгоритма, не ожидаемый путь.
    throw new Error("wrapped dek does not fit envelope header");
  }

  const header = new Uint8Array(3);
  header[0] = ENVELOPE_VERSION;
  header[1] = (wrapped.length >> 8) & 0xff;
  header[2] = wrapped.length & 0xff;

  return concatBytes(header, wrapped, nonce, ciphertext);
}

/** Шифрует PEM и сразу отдаёт base64 -- то, что кладут в `POST /store`. */
export async function sealPemToBase64(
  plaintext: string,
  publicKey: CryptoKey,
): Promise<string> {
  return toBase64(await sealPem(plaintext, publicKey));
}

export type FingerprintCheck = "match" | "mismatch" | "no_pin";

/**
 * Сверяет fingerprint, отданный `GET /api/:scope/crypto`, с пином из сборки
 * (`VITE_CONTOUR_FINGERPRINT`). Защита от подмены публичного ключа
 * скомпрометированным контроллером/XSS -- см. docs/security.md
 * "Скомпрометированный контроллер". Пин не задан -- это не ошибка сборки,
 * но UI должен предупредить оператора отдельно от `mismatch`.
 */
export function checkFingerprint(fingerprint: string): FingerprintCheck {
  const pinned = import.meta.env.VITE_CONTOUR_FINGERPRINT;
  if (pinned === undefined || pinned === "") {
    return "no_pin";
  }
  return pinned === fingerprint ? "match" : "mismatch";
}
