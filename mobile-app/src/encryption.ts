// mobile-app/src/lib/encryption.ts

import * as SecureStore from "expo-secure-store";
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY_NAME = "user_notes_encryption_key";

/**
 * Retrieves the user's unique encryption key from secure storage.
 * If a key does not exist, it generates a new one and saves it.
 * @returns A promise that resolves to the encryption key string.
 */
async function getEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);

  if (!key) {
    key = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
    await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, key);
    console.log("New encryption key generated and saved.");
  }

  return key;
}

/**
 * Encrypts a plaintext string using AES encryption.
 * @param plaintext The string to encrypt.
 * @returns A promise that resolves to the ciphertext string.
 */
export async function encryptNote(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getEncryptionKey();
  const ciphertext = CryptoJS.AES.encrypt(plaintext, key).toString();
  return ciphertext;
}

/**
 * Decrypts a ciphertext string using AES encryption.
 * @param ciphertext The string to decrypt.
 * @returns A promise that resolves to the original plaintext string.
 */
export async function decryptNote(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  try {
    const key = await getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    return plaintext;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "Could not decrypt note.";
  }
}
