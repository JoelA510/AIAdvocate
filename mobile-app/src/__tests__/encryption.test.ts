import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { encryptNote, decryptNote } from "../encryption";

// Mock SecureStore
jest.mock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
}));

// Mock Crypto
jest.mock("expo-crypto", () => ({
    getRandomBytesAsync: jest.fn(),
}));

describe("encryption", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("encryptNote", () => {
        it("should return empty string for empty input", async () => {
            const result = await encryptNote("");
            expect(result).toBe("");
        });

        it("should generate a new key if none exists and encrypt plaintext", async () => {
            // Mock no existing key
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

            // Mock random bytes generation
            const mockRandomBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
            (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockRandomBytes);

            const result = await encryptNote("test");

            // Verify key was generated and saved
            expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
            expect(SecureStore.setItemAsync).toHaveBeenCalled();

            // Verify encryption produced a non-empty result
            expect(result).toBeTruthy();
            expect(result.length).toBeGreaterThan(0);
        });

        it("should use existing key if available", async () => {
            // Mock existing key
            const existingKey = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(existingKey);

            const result = await encryptNote("test");

            // Verify no new key was generated
            expect(Crypto.getRandomBytesAsync).not.toHaveBeenCalled();
            expect(SecureStore.setItemAsync).not.toHaveBeenCalled();

            // Verify encryption produced a result
            expect(result).toBeTruthy();
        });
    });

    describe("decryptNote", () => {
        it("should return empty string for empty input", async () => {
            const result = await decryptNote("");
            expect(result).toBe("");
        });

        it("should decrypt ciphertext back to original plaintext", async () => {
            // Use a fixed key for deterministic encryption/decryption
            const fixedKey = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(fixedKey);

            const plaintext = "Hello, World!";

            // Encrypt
            const encrypted = await encryptNote(plaintext);

            // Decrypt
            const decrypted = await decryptNote(encrypted);

            // Verify round-trip
            expect(decrypted).toBe(plaintext);
        });

        it("should handle decryption errors gracefully", async () => {
            const fixedKey = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(fixedKey);

            // Invalid base64
            const result = await decryptNote("not-valid-base64!!!");

            expect(result).toBe("Could not decrypt note.");
        });

        it("should decrypt multi-line text correctly", async () => {
            const fixedKey = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(fixedKey);

            const plaintext = "Line 1\nLine 2\nLine 3";

            const encrypted = await encryptNote(plaintext);
            const decrypted = await decryptNote(encrypted);

            expect(decrypted).toBe(plaintext);
        });

        it("should handle special characters", async () => {
            const fixedKey = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(fixedKey);

            const plaintext = "Special: 🎉 émojis & symbols!@#$%";

            const encrypted = await encryptNote(plaintext);
            const decrypted = await decryptNote(encrypted);

            expect(decrypted).toBe(plaintext);
        });
    });
});
