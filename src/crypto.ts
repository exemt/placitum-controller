import { createHash, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/** RSA-OAEP с SHA-256 — то, чем браузер оборачивает DEK. */
export const CONTOUR_ALG = "RSA-OAEP-256" as const;

export interface ContourCrypto {
  alg: typeof CONTOUR_ALG;
  publicKeyPem: string;
  fingerprint: string;
}

/**
 * Публичная половина ключа контура. Приватный PEM здесь отвергается:
 * контроллер его не держит, даже если путь указали по ошибке.
 */
export function loadContourCrypto(source: string): ContourCrypto | undefined {
  if (source === "") {
    return undefined;
  }

  const pem = readPem(source);

  if (pem === undefined) {
    throw new Error(`CONTROLLER_CRYPTO_PUBLIC_KEY: cannot read ${source}`);
  }

  if (/BEGIN ([A-Z]+ )?PRIVATE KEY/.test(pem)) {
    throw new Error(
      "CONTROLLER_CRYPTO_PUBLIC_KEY must be the public half, not the private key",
    );
  }

  const key = createPublicKey(pem);
  const publicKeyPem = key.export({ type: "spki", format: "pem" }).toString();
  const der = key.export({ type: "spki", format: "der" });
  const fingerprint =
    "sha256:" + createHash("sha256").update(der).digest("hex");

  return { alg: CONTOUR_ALG, publicKeyPem, fingerprint };
}

function readPem(source: string): string | undefined {
  const trimmed = source.trim();

  if (trimmed.includes("BEGIN")) {
    return trimmed;
  }

  if (!existsSync(trimmed)) {
    return undefined;
  }

  const pem = readFileSync(trimmed, "utf8").trim();
  return pem === "" ? undefined : pem;
}
