/**
 * A player with a history, built with the player model itself (so it is a
 * profile the app could have written): rated 19×19 games over five weeks
 * against opponents near their level, the first course unit finished,
 * problems solved and reviewed until some are mastered, a few missed, some
 * due again. The browser checks of Practice and Today write it into the
 * store before the app boots (practice-progress.mjs), and so does anything
 * that wants a picture of those pages with something on them.
 *
 * Not a check itself: scripts/ui-test.mjs loads the *.mjs files here.
 */
import { DAY, gorToTheta, newProfile, rankToRating, recordGame, recordLesson, recordProblem } from "../../src/web/js/model/player.js";
import { COURSE } from "../../src/web/js/content/course.js";
import { PROBLEMS } from "../../src/web/js/content/problems.js";
import GRADES from "../../src/web/js/content/problem-grades.json" with { type: "json" };

/** A small deterministic generator, so every run seeds the same player. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The profile at `now`: { profile, facts } — `facts` says what was put in
 * (rated games, problems tried, lessons done), for a check to compare with.
 */
export function seededProfile(now = Date.now(), { games = 14 } = {}) {
  const rand = seeded(7);
  let p = newProfile({ rank: 18, at: now - 40 * DAY });
  // Games: a player who starts near 18 kyu and wins more than they lose against a rising ladder.
  for (let i = 0; i < games; i++) {
    const at = now - Math.round((36 - (i * 34) / Math.max(1, games - 1)) * DAY);
    const oppRank = 18 - Math.floor(i / 3);
    const won = i % 4 !== 1;
    p = recordGame(p, { id: "seed-" + i, at, size: 19, won, result: won ? "B+R" : "W+R", moves: 160 + i, color: 1, handicap: 0, opponent: gorToTheta(rankToRating(oppRank)) });
  }
  // The first unit, lesson by lesson.
  const unit = COURSE[0];
  unit.lessons.forEach((l, i) => {
    p = recordLesson(p, l.id, { done: true, step: 99 }, now - (30 - i) * DAY);
  });
  // Problems of the first two grades: most solved cleanly and reviewed as they fell due (so some are mastered),
  // some missed, the newest only met.
  const pool = PROBLEMS.filter((d) => (GRADES[d.id]?.grade || 1) <= 2).slice(0, 60);
  let tried = 0;
  pool.forEach((d, i) => {
    let at = now - Math.round((34 - (i % 30)) * DAY) + i * 60000;
    const clean = rand() > 0.25;
    p = recordProblem(p, d.id, { solved: clean, clean }, at);
    tried++;
    // Review whenever it falls due, until today.
    for (let n = 0; n < 6; n++) {
      const e = p.problems[d.id];
      if (e.retired || !(e.due > 0) || e.due > now - DAY) break;
      // The last eight keep a review waiting, so something is due today.
      if (i >= pool.length - 8 && e.due > now - 10 * DAY) break;
      at = e.due + 3600000;
      p = recordProblem(p, d.id, { solved: true, clean: true }, at);
    }
  });
  return { profile: p, facts: { games, tried, lessons: unit.lessons.length, unit: unit.id } };
}
