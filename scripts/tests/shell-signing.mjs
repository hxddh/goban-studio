/**
 * Shell: signed updates (docs/signing.md). scripts/sign-sums.mjs signs
 * SHA256SUMS with node:crypto; the app verifies with Zig's Ed25519
 * (src/install.zig verifySums). The fixed vector below is also checked by
 * the Zig test "signed sums: a valid signature passes, anything else is
 * refused", so the two sides cannot drift apart.
 */
import os from "node:os";
import { spawnSync } from "node:child_process";
import { test, assert, fs, path, root } from "./helpers.mjs";
import { privateKeyFrom, publicKeyFrom, signSums, verifySums } from "../sign-sums.mjs";
import { generateUpdateKey } from "../gen-update-key.mjs";

const SUMS = "aaaa  GobanStudio-macOS-arm64.zip\nbbbb  GobanStudio-Windows-x64.zip\n";
const SEED7 = Buffer.alloc(32, 7).toString("base64");
const VECTOR_SIG = "4kHujrlWGlr4MAOpyzUpWK3WQwCgMLuw5nH17j7qDklf+8RMm8Ji10GLVem333h8FDjqBGn25dE4a5nhNXtLAw==";
const VECTOR_PUB = "6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=";

function run(args, env) {
  return spawnSync(process.execPath, [path.join(root, "scripts/sign-sums.mjs"), ...args], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
}

await test("signing: a seed signs exactly as the Zig verifier expects (shared vector)", () => {
  const key = privateKeyFrom(SEED7);
  assert.equal(signSums(Buffer.from(SUMS), key), VECTOR_SIG);
  assert.equal(verifySums(Buffer.from(SUMS), VECTOR_SIG, publicKeyFrom(VECTOR_PUB)), true);
  assert.equal(verifySums(Buffer.from(SUMS.replace("aaaa", "aaab")), VECTOR_SIG, publicKeyFrom(VECTOR_PUB)), false);
});

await test("signing: a generated key pair round-trips (PEM private key, base64 public key)", () => {
  const { publicKey, privateKeyPem } = generateUpdateKey();
  assert.equal(Buffer.from(publicKey, "base64").length, 32);
  assert.match(privateKeyPem, /^-----BEGIN PRIVATE KEY-----/);
  const sig = signSums(Buffer.from(SUMS), privateKeyFrom(privateKeyPem));
  assert.equal(Buffer.from(sig, "base64").length, 64);
  assert.equal(verifySums(Buffer.from(SUMS), sig, publicKeyFrom(publicKey)), true);
  // Two runs never print the same key.
  assert.notEqual(generateUpdateKey().publicKey, publicKey);
});

await test("signing: bad keys are refused with a message that never echoes them", () => {
  assert.throws(() => privateKeyFrom(""), /empty/);
  assert.throws(() => privateKeyFrom("c2hvcnQ="), /32-byte seed/);
  assert.throws(() => publicKeyFrom("AAAA"), /32 bytes/);
});

await test("signing: the CLI writes SHA256SUMS.sig, and refuses a key that does not match UPDATE_PUBKEY", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "goban-sign-"));
  try {
    const sums = path.join(dir, "SHA256SUMS");
    fs.writeFileSync(sums, SUMS);
    const ok = run([sums], { UPDATE_SIGNING_KEY: SEED7, UPDATE_PUBKEY: VECTOR_PUB });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(fs.readFileSync(sums + ".sig", "utf8"), VECTOR_SIG + "\n");

    fs.rmSync(sums + ".sig");
    const other = generateUpdateKey().publicKey;
    const bad = run([sums], { UPDATE_SIGNING_KEY: SEED7, UPDATE_PUBKEY: other });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /does not match/);
    assert.ok(!bad.stderr.includes(SEED7), "the key is never printed");
    assert.equal(fs.existsSync(sums + ".sig"), false, "nothing written");

    const missing = run([sums], {});
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /UPDATE_SIGNING_KEY is empty/);
    assert.equal(run([path.join(dir, "nope")], { UPDATE_SIGNING_KEY: SEED7 }).status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
