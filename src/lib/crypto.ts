import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export class SealedSecretError extends Error {
  constructor() {
    super("Stored credential could not be read.");
    this.name = "SealedSecretError";
  }
}

export function decodeEncryptionKey(value: string): Buffer | null {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32) return null;
  return key;
}

export function sealSecret(plaintext: string, key: Buffer): SealedSecret {
  if (key.length !== 32) throw new SealedSecretError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function openSecret(sealed: SealedSecret, key: Buffer): string {
  if (key.length !== 32) throw new SealedSecretError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new SealedSecretError();
  }
}
