import { describe, it, expect } from 'vitest';

// The env var ENCRYPTION_MASTER_KEY is set in tests/setup.ts before this file loads.
// We use dynamic import to ensure the module picks it up after setup runs.

describe('Encryption (AES-256-GCM)', () => {
  async function getEncryption() {
    return await import('@/lib/utils/encryption');
  }

  it('should encrypt and decrypt a string roundtrip', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = 'Hello, Winpilot!';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle empty string', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = '';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle short strings', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = 'a';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle long strings', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = 'A'.repeat(10000);
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle unicode characters', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = 'Hello \u{1F600} \u00E9\u00E0\u00FC \u4F60\u597D \u0410\u0411\u0412';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce output different from input', async () => {
    const { encrypt } = await getEncryption();
    const plaintext = 'secret data';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  it('should produce different ciphertexts for the same input (random salt/IV)', async () => {
    const { encrypt } = await getEncryption();
    const plaintext = 'same input twice';
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should produce ciphertext in the expected format (salt:iv:authTag:data)', async () => {
    const { encrypt } = await getEncryption();
    const plaintext = 'format test';
    const encrypted = encrypt(plaintext);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    // Each part should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, 'base64')).not.toThrow();
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('should fail decryption with tampered ciphertext', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const plaintext = 'tamper test';
    const encrypted = encrypt(plaintext);
    const parts = encrypted.split(':');
    // Tamper with the encrypted data (last part)
    const tamperedData = Buffer.from(parts[3], 'base64');
    tamperedData[0] ^= 0xff;
    parts[3] = tamperedData.toString('base64');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('should fail decryption with invalid format', async () => {
    const { decrypt } = await getEncryption();
    expect(() => decrypt('not:valid')).toThrow('invalid ciphertext format');
    expect(() => decrypt('')).toThrow('invalid ciphertext format');
    expect(() => decrypt('a:b:c:d:e')).toThrow('invalid ciphertext format');
  });

  it('should handle JSON data roundtrip', async () => {
    const { encrypt, decrypt } = await getEncryption();
    const data = JSON.stringify({ user: 'test', token: 'abc123', nested: { a: 1 } });
    const encrypted = encrypt(data);
    const decrypted = decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual({ user: 'test', token: 'abc123', nested: { a: 1 } });
  });
});
