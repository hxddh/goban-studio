/**
 * Make a new Ed25519 key pair for signing release SHA256SUMS (docs/signing.md).
 *
 *   node scripts/gen-update-key.mjs
 *
 * Prints, and writes nowhere:
 *
 *   UPDATE_PUBKEY        base64 of the 32-byte public key. Store it as the
 *                        repository *variable* UPDATE_PUBKEY; the build
 *                        passes it as -Dupdate-pubkey=… and the app then
 *                        refuses updates whose SHA256SUMS.sig it cannot verify.
 *   UPDATE_SIGNING_KEY   the private key as a PKCS#8 PEM. Store it as the
 *                        repository *secret* UPDATE_SIGNING_KEY; only
 *                        scripts/sign-sums.mjs in the release job reads it.
 *
 * Run it on a trusted machine and clear the terminal afterwards. Never commit
 * either value to the repository (the public key is not secret, but keeping it
 * in a variable means rotating it needs no code change). Losing the private key
 * means installed apps can no longer update in place: ship a build with the new
 * public key and let users download it once by hand.
 */
import { generateKeyPairSync } from "node:crypto";

/** A fresh key pair: { publicKey: base64 of 32 bytes, privateKeyPem }. */
export function generateUpdateKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // The raw public key is the last 32 bytes of its SPKI DER encoding.
  const spki = publicKey.export({ type: "spki", format: "der" });
  return {
    publicKey: spki.subarray(spki.length - 32).toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-update-key.mjs")) {
  const { publicKey, privateKeyPem } = generateUpdateKey();
  console.log("UPDATE_PUBKEY (repository variable; build option -Dupdate-pubkey):");
  console.log(publicKey);
  console.log("");
  console.log("UPDATE_SIGNING_KEY (repository secret; never commit it):");
  console.log(privateKeyPem.trim());
}
