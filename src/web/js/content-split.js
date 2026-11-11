/**
 * The content's start-up index and its parts (see content.js). Pure, no
 * imports: scripts/bundle.mjs splits the content modules with it at build
 * time, the app merges each part back as it arrives, and the tests check
 * that the two are one another's inverse.
 */
export const PARTS = ["problems", "course", "classics"];

/** Fields of a problem and of a classic that stay in the start-up index. */
export const PROBLEM_INDEX = ["id", "topic", "theme", "shape"];
export const CLASSIC_INDEX = ["id", "title", "blackName", "whiteName", "date", "result"];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !keys.includes(k) && v !== undefined));

/**
 * The content as { index, bodies }: `index` is what the start-up script
 * carries ({ course, problems, themes, shapes, grades, classics }), and
 * `bodies[part]` maps an id to what that part adds to the object with the
 * id (a lesson's steps; the rest of a problem or a classic). Pure; used at
 * build time and by the tests.
 */
export function splitContent({ course, problems, themes, shapes, grades, classics }) {
  return {
    index: {
      course: course.map((u) => ({ ...u, lessons: u.lessons.map(({ steps, ...rest }) => rest) })),
      problems: problems.map((p) => pick(p, PROBLEM_INDEX)),
      themes,
      shapes,
      // Only the grade is read at run time (the solver's measurements stay in the file).
      grades: Object.fromEntries(Object.entries(grades).map(([id, g]) => [id, { grade: g.grade }])),
      classics: classics.map((c) => pick(c, CLASSIC_INDEX)),
    },
    bodies: {
      course: Object.fromEntries(course.flatMap((u) => u.lessons.map((l) => [l.id, l.steps]))),
      problems: Object.fromEntries(problems.map((p) => [p.id, omit(p, PROBLEM_INDEX)])),
      classics: Object.fromEntries(classics.map((c) => [c.id, omit(c, CLASSIC_INDEX)])),
    },
  };
}

/** Merge a part's bodies into the index objects, in place. */
export function mergePart(part, body, { course, problems, classics }) {
  if (part === "course") {
    for (const u of course) for (const l of u.lessons) if (body[l.id]) l.steps = body[l.id];
  } else if (part === "problems") {
    for (const p of problems) if (body[p.id]) Object.assign(p, body[p.id]);
  } else if (part === "classics") {
    for (const c of classics) if (body[c.id]) Object.assign(c, body[c.id]);
  }
}

/**
 * The start-up index as the source of the content modules the app bundle
 * imports instead of the real ones (paths relative to src/web/js; see
 * scripts/bundle.mjs).
 */
export function indexModules(index) {
  const J = (v) => JSON.stringify(v);
  return {
    "content/course.js": `export const COURSE = ${J(index.course)};`,
    "content/problems.js": `export const PROBLEMS = ${J(index.problems)};\nexport const THEMES = ${J(index.themes)};\nexport const SHAPES = ${J(index.shapes)};`,
    "content/problem-grades.json": `export default ${J(index.grades)};`,
    "content/classics.js": `export const CLASSICS = ${J(index.classics)};`,
    "content/lazy.js": "export const LAZY = true;",
  };
}

/** An esbuild plugin that serves `modules` (indexModules) in place of those files under src/web/js. */
export function indexPlugin(modules) {
  const esc = (f) => f.replace(/\./g, "\\.").replace(/\//g, "[\\\\/]");
  const filter = new RegExp(`[\\\\/]src[\\\\/]web[\\\\/]js[\\\\/](${Object.keys(modules).map(esc).join("|")})$`);
  return {
    name: "content-index",
    setup(b) {
      b.onLoad({ filter }, (args) => {
        // Either path separator (Windows builds).
        const rel = filter.exec(args.path)[1].split("\\").join("/");
        return { contents: modules[rel], loader: "js" };
      });
    },
  };
}
