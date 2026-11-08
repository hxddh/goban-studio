/**
 * Sign a release's SHA256SUMS (docs/signing.md).
 *
 *   UPDATE_SIGNING_KEY=… node scripts/sign-sums.mjs [SHA256SUMS] [SHA256SUMS.sig]
 *
 * Writes the base64 of the 64-byte Ed25519 signature over the exact bytes of
 * SHA256SUMS, one line, to SHA256SUMS.sig. The app (src/install.zig
 * verifySums) checks it against the public key it was built with
 * (-Dupdate-pubkey) before it believes any checksum in the file.
 *
 * UPDATE_SIGNING_KEY is either the PKCS#8 PEM that scripts/gen-update-key.mjs
 * prints, or the base64 of the raw 32-byte seed. With UPDATE_PUBKEY also set,
 * the signature is verified against it before anything is written, so a key
 * pair that does not match the shipped public key fails the release instead
 * of publishing updates no installed app accepts.
 *
 * Exit codes: 0 signed; 1 the key is missing or invalid, or does not match
 * UPDATE_PUBKEY; 2 bad arguments / unreadable SHA256SUMS.
 */
import fs from "node:fs";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

// PKCS#8 DER prefix of an Ed25519 private key; the 32-byte seed follows.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
// SPKI DER prefix of an Ed25519 public key; the 32 raw bytes follow.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** A KeyObject from a PEM or a base64 seed; throws with a plain message. */
export function privateKeyFrom(text) {
  const value = String(text || "").trim();
  if (!value) throw new Error("UPDATE_SIGNING_KEY is empty");
  if (value.includes("-----BEGIN")) {
    const key = createPrivateKey({ key: value, format: "pem" });
    if (key.asymmetricKeyType !== "ed25519") throw new Error("UPDATE_SIGNING_KEY is not an Ed25519 key");
    return key;
  }
  const seed = Buffer.from(value, "base64");
  if (seed.length !== 32 || seed.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
    throw new Error("UPDATE_SIGNING_KEY must be a PKCS#8 PEM or the base64 of a 32-byte seed");
  }
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

/** A public KeyObject from the base64 of its 32 raw bytes (UPDATE_PUBKEY). */
export function publicKeyFrom(b64) {
  const raw = Buffer.from(String(b64 || "").trim(), "base64");
  if (raw.length !== 32) throw new Error("UPDATE_PUBKEY must be the base64 of 32 bytes");
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: "der", type: "spki" });
}

/** The base64 signature of `bytes` (a Buffer) by `privateKey`. */
export function signSums(bytes, privateKey) {
  return sign(null, bytes, privateKey).toString("base64");
}

/** Does `sigB64` sign `bytes` for `publicKey`? */
export function verifySums(bytes, sigB64, publicKey) {
  const sig = Buffer.from(String(sigB64).trim(), "base64");
  return sig.length === 64 && verify(null, bytes, publicKey, sig);
}

function main() {
  const [sumsPath = "SHA256SUMS", sigPath = `${sumsPath}.sig`] = process.argv.slice(2);
  let bytes;
  try {
    bytes = fs.readFileSync(sumsPath);
  } catch (e) {
    console.error(`sign-sums: cannot read ${sumsPath}: ${e.message}`);
    process.exit(2);
  }
  let sig;
  try {
    const key = privateKeyFrom(process.env.UPDATE_SIGNING_KEY);
    sig = signSums(bytes, key);
    if (process.env.UPDATE_PUBKEY) {
      if (!verifySums(bytes, sig, publicKeyFrom(process.env.UPDATE_PUBKEY))) {
        throw new Error("UPDATE_SIGNING_KEY does not match UPDATE_PUBKEY; nothing written");
      }
    }
  } catch (e) {
    // Never print the key itself.
    console.error(`sign-sums: ${e.message}`);
    process.exit(1);
  }
  fs.writeFileSync(sigPath, sig + "\n");
  console.log(`sign-sums: wrote ${sigPath} (${bytes.length} bytes signed)`);
}

if (process.argv[1]?.endsWith("sign-sums.mjs")) main();
