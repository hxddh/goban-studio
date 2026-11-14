/**
 * Core: SGF files as people have them — collections, FF[3] long property names, records without
 * a charset, odd komi values, dates, and moves that cannot be read.
 */
import { test, MESSAGES, assert, loadSGF, setLang } from "./helpers.mjs";
import { countGames, decodeSgf, decodeSgfBytes, guessCharset, parseDate, parseKomi } from "../../src/web/js/sgf.js";

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));
const moves = (game) => game.mainLine().slice(1).map((n) => (n.move.color > 0 ? "B" : "W") + (n.move.pass ? "pass" : `${n.move.x},${n.move.y}`));

await test("SGF collections: the first game loads, the count is reported, and any game can be asked for", () => {
  const text = "(;SZ[9]PB[one];B[aa])\n(;SZ[13]PB[two];B[bb];W[cc])(;SZ[9]PB[three])";
  const r = loadSGF(text);
  assert.equal(r.game.playerBlack, "one");
  assert.equal(r.games, 3);
  assert.equal(r.index, 0);
  assert.deepEqual(r.codes, ["collection"]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /3/);
  assert.equal(countGames(text), 3);
  // Asking for a game by number: no "only the first" warning.
  const second = loadSGF(text, { index: 1 });
  assert.equal(second.game.playerBlack, "two");
  assert.equal(second.game.size, 13);
  assert.deepEqual(moves(second.game), ["B1,1", "W2,2"]);
  assert.equal(second.index, 1);
  assert.equal(second.games, 3);
  assert.deepEqual(second.codes, []);
  assert.deepEqual(loadSGF(text, { index: 0 }).codes, []);
  assert.equal(loadSGF(text, { index: 2 }).game.playerBlack, "three");
  // Every game of a problem collection is reachable.
  let many = "";
  for (let i = 0; i < 200; i++) many += `(;SZ[19]AB[aa][ab]AW[ba]C[problem ${i}];B[bb])\n`;
  assert.equal(countGames(many), 200);
  assert.equal(loadSGF(many, { index: 199 }).game.root.comment, "problem 199");
  // A game that is not there is an error the caller can tell apart.
  assert.throws(() => loadSGF(text, { index: 3 }), (e) => e.code === "no-such-game" && e.games === 3);
  assert.throws(() => loadSGF(text, { index: -1 }), (e) => e.code === "no-such-game");
  // An ordinary record: one game, no warning, variations are not games.
  const one = loadSGF("(;SZ[9];B[aa](;W[bb])(;W[cc]))");
  assert.equal(one.games, 1);
  assert.deepEqual(one.codes, []);
  assert.equal(one.charset, null);
});

await test("SGF FF[3]: long property names are read by their capitals, lowercase names as written", () => {
  const long = loadSGF("(;GaMe[1]SiZe[9]AddBlack[cc][dd]AddWhite[ee];Black[aa];White[bb])");
  assert.deepEqual(long.warnings, []);
  assert.equal(long.game.size, 9);
  assert.deepEqual(moves(long.game), ["B0,0", "W1,1"]);
  const root = long.game.root.board;
  assert.deepEqual([root.get([2, 2]), root.get([3, 3]), root.get([4, 4])], [1, 1, -1]);
  const lower = loadSGF("(;sz[9]km[5.5]pb[kuro];b[aa];w[bb])");
  assert.equal(lower.game.size, 9);
  assert.equal(lower.game.komi, 5.5);
  assert.equal(lower.game.playerBlack, "kuro");
  assert.deepEqual(moves(lower.game), ["B0,0", "W1,1"]);
  // More names of the old style, and the export uses the short ones.
  const more = loadSGF("(;GaMe[1]SiZe[9]KoMi[5.5]PlayerBlack[Shusaku]PlayerWhite[Gennan]DaTe[1846-09-11]REsult[B+2];Black[cc]Comment[the ear-reddening game])");
  assert.equal(more.game.komi, 5.5);
  assert.equal(more.game.playerBlack, "Shusaku");
  assert.equal(more.game.playerWhite, "Gennan");
  assert.equal(more.game.current.comment, "the ear-reddening game");
  assert.equal(more.game.current.result, "B+2");
  const out = more.game.toSGF();
  assert.ok(out.includes("PB[Shusaku]PW[Gennan]DT[1846-09-11]RE[B+2]"), out);
  // Unknown properties keep their (short) name on export.
  assert.ok(loadSGF("(;SZ[9]GameName[x]XX[1];B[aa])").game.toSGF().includes("GN[x]XX[1]"));
});

await test("SGF without CA: legacy CJK bytes are decoded by a guess, and the import says so", () => {
  // 聂卫平 in GBK, no CA.
  const gbk = bytes("(;SZ[9]PB[", [0xc4, 0xf4, 0xce, 0xc0, 0xc6, 0xbd], "];B[aa])");
  const d = decodeSgf(gbk, { lang: "zh" });
  assert.deepEqual([d.charset, d.guessed], ["gb18030", true]);
  setLang("en");
  const r = loadSGF(gbk);
  assert.equal(r.game.playerBlack, "聂卫平");
  assert.equal(r.charset, "gb18030");
  assert.deepEqual(r.codes, ["guessedCharset"]);
  assert.match(r.warnings[0], /GBK/);
  assert.equal(decodeSgfBytes(gbk), "(;SZ[9]PB[聂卫平];B[aa])");
  // 本因坊秀策 in Shift_JIS, no CA, whatever language the app is in.
  const sjis = bytes("(;SZ[9]PB[", [0x96, 0x7b, 0x88, 0xf6, 0x96, 0x56, 0x8f, 0x47, 0x8d, 0xf4], "]PW[", [0x88, 0xe4, 0x8e, 0x52, 0x97, 0x54, 0x91, 0xbe], "];B[aa])");
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    const j = loadSGF(sjis);
    assert.equal(j.game.playerBlack, "本因坊秀策", lang);
    assert.equal(j.game.playerWhite, "井山裕太", lang);
    assert.deepEqual(j.codes, ["guessedCharset"], lang);
    assert.ok(j.warnings[0].includes("Shift_JIS"), lang);
    assert.equal(loadSGF(gbk).game.playerBlack, "聂卫平", lang);
  }
  setLang("en");
  // Shift_JIS whose second byte is a backslash (ソ, 表) survives the guess.
  assert.equal(loadSGF(bytes("(;SZ[9]PB[", [0x83, 0x5c, 0x95, 0x5c, 0x8e, 0xa6], "];B[aa];W[bb])")).game.playerBlack, "ソ表示");
  // Big5 (張栩), Japanese with kana in EUC-JP (黒番中押し勝ち), and a longer Korean text in EUC-KR (이세돌 백 불계승).
  assert.equal(guessCharset(bytes("PB[", [0xb1, 0x69, 0xae, 0xdd], "]")), "big5");
  assert.equal(guessCharset(bytes("C[", [0xb9, 0xf5, 0xc8, 0xd6, 0xc3, 0xe6, 0xb2, 0xa1, 0xa4, 0xb7, 0xbe, 0xa1, 0xa4, 0xc1], "]")), "euc-jp");
  const korean = bytes("C[", [0xc0, 0xcc, 0xbc, 0xbc, 0xb5, 0xb9, 0x20, 0xb9, 0xe9, 0x20, 0xba, 0xd2, 0xb0, 0xe8, 0xbd, 0xc2], "]");
  for (const lang of ["zh", "en", "ko", "ja"]) assert.equal(guessCharset(korean, lang), "euc-kr", lang);
  assert.equal(decodeSgf(korean).text, "C[이세돌 백 불계승]");
  // A short Hangul name reads the same as common Hanzi: the app's language decides.
  const name = bytes("PB[", [0xc0, 0xcc, 0xc3, 0xa2, 0xc8, 0xa3], "]");
  assert.equal(guessCharset(name, "ko"), "euc-kr");
  assert.equal(guessCharset(name, "zh"), "gb18030");
  assert.equal(decodeSgf(name, { lang: "ko" }).text, "PB[이창호]");
});

await test("SGF charsets: UTF-8, a named charset and Western text are never guessed", () => {
  setLang("en");
  // Valid UTF-8 is UTF-8, with or without CA, and carries no warning.
  const utf8 = new Uint8Array(Buffer.from("(;SZ[9]PB[聂卫平]PW[本因坊秀策];B[aa])", "utf8"));
  const u = loadSGF(utf8);
  assert.equal(u.game.playerBlack, "聂卫平");
  assert.equal(u.game.playerWhite, "本因坊秀策");
  assert.equal(u.charset, "utf-8");
  assert.deepEqual(u.codes, []);
  assert.deepEqual([decodeSgf(utf8).charset, decodeSgf(utf8).guessed], ["utf-8", false]);
  // A record that names its charset is read in it, without a warning.
  const named = loadSGF(bytes("(;SZ[9]CA[gb2312]PB[", [0xc4, 0xf4, 0xce, 0xc0, 0xc6, 0xbd], "];B[aa])"));
  assert.equal(named.game.playerBlack, "聂卫平");
  assert.deepEqual(named.codes, []);
  // CA[…] written inside a property value (a comment) is text, not the record's charset.
  const quoted = bytes("(;SZ[9]C[saved as CA[UTF-8] by mistake]PB[", [0xc4, 0xf4, 0xce, 0xc0, 0xc6, 0xbd], "];B[aa])");
  assert.equal(loadSGF(quoted).game.playerBlack, "聂卫平");
  assert.equal(decodeSgf(quoted, { lang: "zh" }).charset, "gb18030");
  const quotedNamed = bytes("(;SZ[9]C[not CA[UTF-8]]CA[gb2312]PB[", [0xc4, 0xf4, 0xce, 0xc0, 0xc6, 0xbd], "];B[aa])");
  assert.deepEqual([decodeSgf(quotedNamed).charset, decodeSgf(quotedNamed).guessed], ["gb18030", false]);
  // A Shift_JIS name whose trail byte is a backslash, before CA, does not hide CA.
  const sjisNamed = decodeSgf(bytes("(;SZ[9]PB[", [0x83, 0x5c], "]CA[Shift_JIS];B[aa])"));
  assert.deepEqual([sjisNamed.text, sjisNamed.guessed], ["(;SZ[9]PB[ソ]CA[Shift_JIS];B[aa])", false]);
  // Latin-1 names stay Latin-1 (the FF[4] default): an accented letter next
  // to "]" or another letter must not be taken for half a CJK character.
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    for (const [raw, want] of [[[0x63, 0x61, 0x66, 0xe9], "café"], [[77, 252, 108, 108, 101, 114], "Müller"], [[0x4a, 0x6f, 0x73, 0xe9, 0x20, 0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72], "José Müller"]]) {
      const r = loadSGF(bytes("(;SZ[9]PB[", raw, "];B[aa])"));
      assert.equal(r.game.playerBlack, want, lang);
      assert.deepEqual(r.codes, [], lang);
      assert.equal(r.charset, "windows-1252", lang);
    }
  }
  setLang("en");
  // Plain ASCII, and text input, involve no charset at all.
  assert.equal(guessCharset(bytes("(;SZ[9];B[aa])")), null);
  assert.equal(loadSGF("(;SZ[9]PB[聂卫平];B[aa])").charset, null);
  // The warnings exist in every language with their placeholder.
  for (const key of ["sgf.warn.collection", "sgf.warn.guessedCharset"]) for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES[key][lang].includes("{0}"), `${key} ${lang}`);
  for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES["sgf.warn.komi"][lang].includes("{0}") && MESSAGES["sgf.warn.komi"][lang].includes("{1}"), lang);
});

await test("SGF komi: decimal commas and hundredths are read, nonsense falls back to the ruleset's komi", () => {
  setLang("en");
  const komi = (km, head = "") => loadSGF(`(;SZ[19]${head}KM[${km}];B[aa])`);
  for (const [km, want] of [["6.5", 6.5], ["6.50", 6.5], [" 6.5 ", 6.5], ["0", 0], ["-5.5", -5.5], ["7,5", 7.5], ["0,5", 0.5], ["375", 7.5], ["650", 6.5], ["750", 7.5], ["550", 5.5], ["275", 5.5], ["325", 6.5], ["50", 50], ["-50", -50], ["3.75", 3.75]]) {
    const r = komi(km);
    assert.equal(r.game.komi, want, `KM[${km}]`);
    assert.deepEqual(r.codes, [], `KM[${km}]`);
  }
  // Not a komi anyone plays: the ruleset's own, and a warning naming both.
  for (const km of ["abc", "1e3", "9999", "5000", "51", "-80", "377", "7.5.5", "6,5,5"]) {
    const r = komi(km);
    assert.equal(r.game.komi, 6.5, `KM[${km}]`);
    assert.deepEqual(r.codes, ["komi"], `KM[${km}]`);
    assert.ok(r.warnings[0].includes(km) && r.warnings[0].includes("6.5"), r.warnings[0]);
  }
  assert.equal(komi("9999", "RU[Chinese]").game.komi, 7.5);
  assert.equal(komi("9999", "RU[Chinese]AB[dd][pp]").game.komi, 0.5, "the komi of a handicap game");
  // No KM, or an empty one: the default, silently.
  assert.deepEqual(loadSGF("(;SZ[19];B[aa])").codes, []);
  assert.deepEqual(komi("").codes, []);
  assert.equal(komi("").game.komi, 6.5);
  // parseKomi never leaves ±50.
  for (const raw of ["375", "650", "100000", "-99999", "1500", "1501", "5100", "-375", "Infinity", "NaN", "0x10", ""]) {
    const v = parseKomi(raw);
    assert.ok(v === null || (Number.isFinite(v) && Math.abs(v) <= 50), `${raw} -> ${v}`);
  }
  assert.equal(parseKomi("-375"), -7.5);
  assert.equal(parseKomi("1500"), 15);
  assert.equal(parseKomi("1600"), null);
});

await test("SGF dates: the record's own date is kept as written, and a record without one gets none", () => {
  const dt = (sgf) => /DT\[([^\]]*)\]/.exec(sgf)?.[1] ?? null;
  for (const date of ["1846", "1846-09", "1846-09-11", "1933-10-16,17", "1996-12-27,28,1997-01-03,04", "1996-05,06", "1996-05-06,07,08", "2001-12-31,2002-01-01"]) {
    const g = loadSGF(`(;SZ[19]DT[${date}];B[aa])`).game;
    assert.equal(dt(g.toSGF()), date, date);
    assert.equal(g.dateText, date);
    assert.equal(g.date.getFullYear(), Number(date.slice(0, 4)), date);
    // And it survives a second round trip.
    assert.equal(dt(loadSGF(g.toSGF()).game.toSGF()), date, date);
  }
  assert.equal(loadSGF("(;SZ[19]DT[1846-09-11];B[aa])").game.date.getMonth(), 8);
  // Dots and slashes are read as hyphens.
  assert.equal(dt(loadSGF("(;SZ[19]DT[2019.03.07];B[aa])").game.toSGF()), "2019-03-07");
  assert.equal(dt(loadSGF("(;SZ[19]DT[2019/03/07];B[aa])").game.toSGF()), "2019-03-07");
  // No DT, an empty one or one that is not a date: no date, never today's.
  for (const head of ["", "DT[]", "DT[2020-13-45]", "DT[yesterday]", "DT[1846-9-11]", "DT[12-25]", "DT[1846,1847-01,15-02-03x]"]) {
    const g = loadSGF(`(;SZ[19]${head};B[aa])`).game;
    assert.equal(dt(g.toSGF()), null, head);
    assert.equal(g.date, null, head);
    assert.equal(g.dateText, "", head);
  }
  assert.deepEqual(parseDate("1933-10-16,17").date, new Date(1933, 9, 16));
  assert.deepEqual(parseDate(" 1846 , 1847 "), { text: "1846,1847", date: new Date(1846, 0, 1) });
});

await test("SGF: moves that cannot be read stand as passes but never end the game", () => {
  setLang("en");
  const r = loadSGF("(;SZ[9];B[zz];W[zy];B[cc];W[dd])");
  assert.deepEqual(r.codes, ["badMove", "badMove"]);
  assert.deepEqual(moves(r.game), ["Bpass", "Wpass", "B2,2", "W3,3"]);
  assert.deepEqual(r.game.mainLine().map((n) => n.phase), ["playing", "playing", "playing", "playing", "playing"]);
  assert.deepEqual(r.game.mainLine().map((n) => n.passes), [0, 0, 0, 0, 0]);
  // Two illegal moves in a row (both on an occupied point), likewise.
  const ill = loadSGF("(;SZ[9];B[cc];W[cc];B[cc];W[dd])");
  assert.deepEqual(ill.codes, ["illegalMove", "illegalMove"]);
  assert.ok(ill.game.mainLine().every((n) => n.phase === "playing"));
  // An unreadable move next to a real pass is still one pass, not two.
  const mixed = loadSGF("(;SZ[9];B[cc];W[zz];B[];W[dd])");
  assert.ok(mixed.game.mainLine().every((n) => n.phase === "playing"));
  // Two real passes do end the game, as before.
  const over = loadSGF("(;SZ[9];B[cc];W[];B[])").game;
  assert.equal(over.phase, "scoring");
  assert.deepEqual(over.mainLine().map((n) => n.passes), [0, 0, 1, 2]);
});
