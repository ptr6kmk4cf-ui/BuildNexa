import { describe, expect, it } from "vitest";
import { decodeEncryptionKey, openSecret, sealSecret, SealedSecretError } from "@/lib/crypto";

const token = "gho_supersecrettokenvalue1234567890";

describe("credential sealing", () => {
  it("round-trips a token and keeps the plaintext out of the sealed payload", () => {
    const key = Buffer.alloc(32, 9);
    const sealed = sealSecret(token, key);
    expect(openSecret(sealed, key)).toBe(token);
    expect(JSON.stringify(sealed)).not.toContain(token);
    expect(sealed.ciphertext).not.toContain("gho_");
  });

  it("uses a fresh iv so two seals of the same token differ", () => {
    const key = Buffer.alloc(32, 4);
    const first = sealSecret(token, key);
    const second = sealSecret(token, key);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects a tampered tag and the wrong key", () => {
    const key = Buffer.alloc(32, 3);
    const sealed = sealSecret(token, key);
    expect(() => openSecret({ ...sealed, tag: "AAAA" }, key)).toThrow(SealedSecretError);
    expect(() => openSecret(sealed, Buffer.alloc(32, 8))).toThrow(SealedSecretError);
    try {
      openSecret(sealed, Buffer.alloc(32, 8));
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(token);
    }
  });

  it("accepts a 32-byte base64 key and rejects other lengths", () => {
    const key = Buffer.alloc(32, 1);
    expect(decodeEncryptionKey(key.toString("base64"))?.equals(key)).toBe(true);
    expect(decodeEncryptionKey(Buffer.alloc(16, 1).toString("base64"))).toBeNull();
  });
});
