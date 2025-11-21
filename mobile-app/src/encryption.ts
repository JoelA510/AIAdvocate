// mobile-app/src/lib/encryption.ts

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const ENCRYPTION_KEY_NAME = "user_notes_encryption_key";

/**
 * Retrieves the user's unique encryption key from secure storage.
 * If a key does not exist, it generates a new one and saves it.
 * @returns A promise that resolves to the encryption key string.
 */
async function getEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);

  if (!key) {
    // Generate 32 random bytes and convert to hex string
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, key);
    console.log("New encryption key generated and saved.");
  }

  return key;
}

/**
 * Encrypts a plaintext string using a simple XOR cipher with the key.
 * Note: This is a basic implementation. For production use, consider using
 * a proper encryption library or expo-crypto's digest functions with a server-side solution.
 * @param plaintext The string to encrypt.
 * @returns A promise that resolves to the base64-encoded ciphertext string.
 */
export async function encryptNote(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getEncryptionKey();

  // Simple XOR encryption (for demonstration; consider crypto.subtle for production)
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(plaintext);
  const keyBytes = encoder.encode(key);

  const encrypted = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i++) {
    encrypted[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  // Convert to base64
  return btoa(String.fromCharCode(...Array.from(encrypted)));
}

/**
 * Decrypts a base64-encoded ciphertext string.
 * @param ciphertext The base64 string to decrypt.
 * @returns A promise that resolves to the original plaintext string.
 */
export async function decryptNote(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  try {
    const key = await getEncryptionKey();

    // Decode from base64
    const encrypted = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    // XOR decryption
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(key);

    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "Could not decrypt note.";
  }
}
