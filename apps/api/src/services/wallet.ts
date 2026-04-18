import { createKeyPairSignerFromBytes } from "@solana/kit";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Minimal base58 encoder — Solana address = base58(public_key_bytes)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Uint8Array): string {
  let num = bytes.reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);
  let result = "";
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % 58n)] + result;
    num /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

// ─── Encryption (AES-GCM) ────────────────────────────────────────────────────

async function getEncryptionKey(): Promise<CryptoKey> {
  const hex = process.env.WALLET_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) throw new Error("WALLET_ENCRYPTION_KEY missing or too short — must be 32 bytes (64 hex chars)");
  const keyBytes = Buffer.from(hex, "hex");
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptKey(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = Buffer.from(iv).toString("base64");
  const ctB64 = Buffer.from(ciphertext).toString("base64");
  return `${ivB64}:${ctB64}`;
}

async function decryptKey(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = encrypted.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a new Solana keypair and return the address + encrypted key bytes.
 * Uses crypto.subtle with extractable: true — @solana/kit generates non-extractable
 * keys by default which prevents export, so we bypass it for generation only.
 * Ed25519 PKCS8: 16-byte ASN.1 header + 32-byte seed.
 * Stored format: AES-GCM encrypted JSON int array (seed 32 + pubkey 32 = 64 bytes).
 */
export async function generateWallet(): Promise<{ address: string; keyBytes: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;

  // PKCS8 for Ed25519 = 16-byte ASN.1 header + 32-byte seed
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const privateBytes = pkcs8.slice(pkcs8.length - 32);

  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const address = toBase58(publicBytes);

  const combined = new Uint8Array([...privateBytes, ...publicBytes]);
  const keyBytes = await encryptKey(JSON.stringify(Array.from(combined)));

  return { address, keyBytes };
}

/**
 * Generate a new Base/EVM keypair.
 * Returns the 0x address and AES-GCM encrypted private key hex string.
 */
export async function generateEvmWallet(): Promise<{ address: string; keyHex: string }> {
  const privateKey = generatePrivateKey(); // `0x${string}`
  const account = privateKeyToAccount(privateKey);
  const keyHex = await encryptKey(privateKey);
  return { address: account.address, keyHex };
}

/**
 * Decrypt and export the EVM private key for manual use (MetaMask etc.).
 */
export async function exportEvmWalletKey(encryptedKeyHex: string): Promise<string> {
  return decryptKey(encryptedKeyHex);
}

/**
 * Load a viem account from encrypted EVM key stored in DB.
 */
export async function loadEvmAccount(encryptedKeyHex: string) {
  const privateKey = await decryptKey(encryptedKeyHex);
  return privateKeyToAccount(privateKey as `0x${string}`);
}

/**
 * Reload a KeyPairSigner from the encrypted keyBytes stored in DB.
 */
export async function loadWalletSigner(encryptedKeyBytes: string) {
  const json = await decryptKey(encryptedKeyBytes);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(JSON.parse(json) as number[]);
  } catch (err: any) {
    throw new Error(`Failed to parse stored wallet key: ${err.message}`);
  }
  return createKeyPairSignerFromBytes(bytes);
}

/**
 * Decrypt and export the raw keypair for manual use (Phantom, Solflare, etc.).
 * Returns the 64-byte secret key as base58 and as a JSON int array.
 */
export async function exportWalletKey(encryptedKeyBytes: string): Promise<{
  secretKeyBase58: string;
  secretKeyJson: number[];
}> {
  const json = await decryptKey(encryptedKeyBytes);
  let bytes: number[];
  try {
    bytes = Array.from(JSON.parse(json) as number[]);
  } catch (err: any) {
    throw new Error(`Failed to parse stored wallet key: ${err.message}`);
  }
  return {
    secretKeyBase58: toBase58(new Uint8Array(bytes)),
    secretKeyJson: bytes,
  };
}
