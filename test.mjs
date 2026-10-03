/* Tests for Chorus — the parts that break quietly.
 *
 * A quiz is only as good as the blanking: the word the learner has to supply
 * must really be missing from the line and really be in the line to begin with.
 * The starter song has to be complete and its facts have to appear in its own
 * lyrics. And the page and the script have to agree on every id and screen.
 *
 * Run: node test.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.location = { origin: "https://example.test", pathname: "/", search: "", href: "" };
globalThis.document = {};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__CHORUS_TEST__ = true;

const dir = mkdtempSync(join(tmpdir(), "chorus-"));

const packPath = join(dir, "pack.mjs");
writeFileSync(packPath, readFileSync(join(here, "pack.js"), "utf8"));
await import(pathToFileURL(packPath).href);

const source = readFileSync(join(here, "app.js"), "utf8");
const appPath = join(dir, "app.mjs");
writeFileSync(
    appPath,
    `${source}
export { styles, styleByKey, lineHasTerm, blankLine, checkAnswer, validateSong, normalizeSong, buildQuiz, starterSong, state };
`,
);
const app = await import(pathToFileURL(appPath).href);

let passed = 0;
const failures = [];

function ok(name, condition) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(name);
}

function eq(name, actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    ok(a === b ? name : `${name} — got ${a}, wanted ${b}`, a === b);
}

/* ----------------------------------------------------------------- the styles */

const styles = app.styles();
eq("there are styles to choose from", styles.length >= 6, true);
eq("no style key is used twice", styles.length - new Set(styles.map((style) => style.key)).size, 0);
eq("every style has a label and a prompt", styles.filter((style) => !style.label || !style.prompt).map((style) => style.key), []);
eq("a style is looked up by key", app.styleByKey(styles[2].key).label, styles[2].label);
eq("an unknown style falls back to the first", app.styleByKey("nonsense").key, styles[0].key);

/* ------------------------------------------------------------ the starter song */

const starter = app.starterSong();
eq("the starter song is complete", app.validateSong(starter), "");
eq("the starter song tests seven facts", starter.facts.length, 7);
eq("the starter song has lyrics", starter.lyrics.split("\n").filter((line) => line.trim()).length >= 12, true);
eq(
    "every fact's line really is in the lyrics",
    starter.facts.filter((fact) => !starter.lyrics.includes(fact.line)).map((fact) => fact.term),
    [],
);
eq(
    "every fact's term really is in its own line",
    starter.facts.filter((fact) => !app.lineHasTerm(fact.line, fact.term)).map((fact) => fact.term),
    [],
);
eq(
    "every fact explains itself",
    starter.facts.filter((fact) => !fact.meaning || fact.meaning.length < 10).map((fact) => fact.term),
    [],
);

/* ------------------------------------------------------------ blanking the line */

const physical = starter.facts[0];
const blanked = app.blankLine(physical.line, physical.term);
eq("the blank replaces the word", blanked.includes("＿＿＿＿"), true);
eq("the word itself is gone", app.lineHasTerm(blanked, physical.term), false);
eq("the rest of the line survives", blanked.includes("the bits upon the wire"), true);

const multi = app.blankLine("layer six is Presentation, encryption and encoding.", "Presentation");
eq("a multi-word fact blanks too", multi.includes("＿＿＿＿"), true);
eq("and leaves its own line intact", multi.includes("encryption and encoding"), true);

const quiz = app.buildQuiz(starter);
eq("the quiz asks one question per fact", quiz.items.length, starter.facts.length);
eq("the quiz starts at the first fact", quiz.index, 0);
eq(
    "no question gives its own answer away",
    quiz.items.filter((item) => app.lineHasTerm(item.blanked, item.term)).map((item) => item.term),
    [],
);

/* -------------------------------------------------------------- marking answers */

eq("an exact answer counts", app.checkAnswer("Physical", "Physical"), true);
eq("case does not matter", app.checkAnswer("physical", "Physical"), true);
eq("nor does punctuation", app.checkAnswer("Data-Link!", "Data Link"), true);
eq("nor does extra space", app.checkAnswer("  Data   Link  ", "Data Link"), true);
eq("a two-word fact is right if both words are there", app.checkAnswer("the link layer for data", "Data Link"), true);
eq("one word of a two-word fact is not enough", app.checkAnswer("link", "Data Link"), false);
eq("a wrong word is wrong", app.checkAnswer("Network", "Physical"), false);
eq("an empty answer is wrong", app.checkAnswer("", "Physical"), false);
eq("whitespace is wrong", app.checkAnswer("   ", "Physical"), false);

/* ------------------------------------------------- refusing a bad song */

const clone = () => JSON.parse(JSON.stringify(starter));
const strip = (field) => {
    const data = clone();
    delete data[field];
    return app.validateSong(data);
};

ok("a song with no title is refused", strip("title"));
ok("a song with no lyrics is refused", strip("lyrics"));
ok("a song with no subject is refused", strip("subject"));
ok("a song with no facts is refused", app.validateSong({ ...clone(), facts: [] }));
ok("a song with only three facts is refused", app.validateSong({ ...clone(), facts: starter.facts.slice(0, 3) }));
ok("a fact that is not in its own line is refused", app.validateSong({ ...clone(), facts: [{ term: "Widget", line: "nothing to see here", meaning: "a thing" }] }));
ok(
    "a fact with no explanation is refused",
    app.validateSong({ ...clone(), facts: starter.facts.map((fact, index) => (index ? fact : { ...fact, meaning: "" })) }),
);
ok("something that is not a song is refused", app.validateSong("a song, honestly"));
eq("a complete song is accepted", app.validateSong(clone()), "");

const mixed = app.normalizeSong(
    {
        ...clone(),
        facts: [
            ...starter.facts,
            { term: "Widget", line: "no sign of it anywhere", meaning: "junk" },
            { term: "", line: "nothing", meaning: "junk" },
        ],
    },
    styles[0].key,
);
eq("normalising throws away facts that cannot be quizzed", mixed.facts.length, starter.facts.length);
eq("normalising keeps the style it was asked for", mixed.styleKey, styles[0].key);
eq("normalising gives the song an id", typeof mixed.id, "string");
eq("normalising keeps the lyric sheet", mixed.lyrics, starter.lyrics);

/* ------------------------------------------- the page and the script agree */

const html = readFileSync(join(here, "index.html"), "utf8");
const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
eq("no id is used twice in the page", htmlIds.length - new Set(htmlIds).size, 0);

const camel = (id) => id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const wiring = source.match(/for \(const id of \[([\s\S]*?)\]\)/);
ok("the page wiring list is where the tests expect it", Boolean(wiring));
const wired = new Set([...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => camel(match[1])));

const reached = new Set([...source.matchAll(/\bel\.(\w+)/g)].map((match) => match[1]));
eq("every element the app reaches for is wired up", [...reached].filter((name) => !wired.has(name)), []);
eq("every id in the wiring list is really in the page", [...wired].filter((name) => !htmlIds.some((id) => camel(id) === name)), []);
eq("the wiring list holds ids, not keys", [...wiring[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter((id) => !htmlIds.includes(id)), []);

const screens = source.match(/const SCREENS = \[([\s\S]*?)\]/);
ok("the screen list is where the tests expect it", Boolean(screens));
const screenNames = [...screens[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
eq("every screen the renderer switches is in the page", screenNames.filter((name) => !htmlIds.includes(name)), []);
eq("every screen the renderer switches is wired up", screenNames.filter((name) => !wired.has(name)), []);
eq("every screen it switches is reachable", screenNames.filter((name) => !source.includes(`state.screen = "${name}"`)), []);
eq("the app starts on a screen it can switch to", screenNames.includes(app.state.screen), true);
eq("the page has no screen the renderer never switches", ["write", "song", "quiz", "playlist"].filter((name) => !screenNames.includes(name)), []);

/* ------------------------------------------------------------- the report */

if (failures.length) {
    console.error(`\n${failures.length} failed, ${passed} passed:\n`);
    for (const name of failures) console.error(`  ✗ ${name}`);
    process.exit(1);
}
console.log(`ok — ${passed} checks passed`);
