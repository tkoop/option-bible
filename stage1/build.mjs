/*

Stage 1 for the translations in sources/ - every translation except the BSB,
which compile.mjs still builds from the epub.

	node stage1/build.mjs [id ...]

With no arguments it builds every directory in sources/. Each chapter is
normalized to the fragment contract in CHAPTER_HTML_FORMAT.md, run through
decorateChapter() - the shared stage 2, and the pass that parses divine
pronouns and titles into cap/nocap/bsb variants - and written to

	public/translations/<id>/<slug>-<chapter>.html
	public/translations/<id>/search.json

The sources are hand-made and a few files are damaged, so every file is
checked against the contract as it goes. Only the normalizations below are
repairs; everything else is reported at the end instead of being guessed at,
and the exit status is 1 when there were errors.

Normalizations (each is counted in the report):

	- trailing whitespace is stripped (the contract wants no trailing newline)
	- ids in the source's other format, v45:1, become v1
	- a continuation marker for a split verse, v6b, is dropped - its text
	  belongs to the verse before it
	- an empty verse marker is given the number its id already holds
	- a </span cut off at the end of a truncated file is completed
	- a you span's data-word is set to the text it actually carries, which is
	  what the contract means by "the original word exactly as it appears"
	- you spans holding a word the runtime cannot conjugate (He, you're, a
	  Greek gloss) are unwrapped, keeping the text
	- a missing wrapper is added and an unclosed one is closed, along with any
	  <p> the file was cut off inside
	- the space after a verse marker is removed - the marker's spacing is the
	  CSS's job, and BSB files have none

*/

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
	addVerseIds,
	decorateChapter,
	extractVerseTexts,
} from "../decorate.mjs";

const SOURCES_DIR = "sources";
const OUT_DIR = "public/translations";
const BSB_DIR = join(OUT_DIR, "bsb");

// The nine you-forms CHAPTER_HTML_FORMAT.md allows. The runtime's matchYou
// conjugates exactly these; any other data-word comes back unchanged, which
// is why data-word has to hold the word as it is actually printed.
const NINE = new Set([
	"you", "your", "yours",
	"You", "Your", "Yours",
	"YOU", "YOUR", "YOURS",
]);

// The you-words worth keeping a span around even though matchYou cannot
// conjugate them: the reflexives, which no you-setting rewrites anyway.
const KEEP_SPAN = /^(you|your|yours)(self|selves)?$/i;

const ALLOWED_DIV_CLASSES = new Set(["calibre2", "fn", "calibre8", "inscrip1"]);

function countOf(body, re) {
	return (body.match(re) || []).length;
}

// ---------- normalization ----------

function trimTrailing(body) {
	return body.replace(/\s+$/, "");
}

// A file cut off mid-tag can end with a closing tag missing its ">". The
// tag is completed so the marker before the cut still validates.
function closeDanglingTag(body, stats) {
	if (body.endsWith("</span")) {
		stats.danglingSpan++;
		return body + ">";
	}
	return body;
}

// The source's other id format: <span class="reftext" id="v45:1">1</span>.
function fixColonIds(body, stats) {
	return body.replace(
		/(<span class="reftext" id="v)\d+:(\d+")/g,
		(_, head, tail) => {
			stats.colonIds++;
			return head + tail;
		}
	);
}

// A continuation marker the source uses where it splits one verse in two,
// <span class="reftext" id="v6b">6</span>. The text belongs to the verse
// before it, so the marker and its repeated number are dropped.
function dropContinuationMarkers(body, stats) {
	return body.replace(
		/<span class="reftext" id="v\d+[a-z]">[^<]*<\/span>/g,
		() => {
			stats.continuations++;
			return "";
		}
	);
}

// data-word has to be the word as it appears in the text: matchYou renders
// data-word back into the span, so a mismatched value would print the wrong
// word (a Greek gloss in an English sentence, say, or "you" where the text
// says "You"). Spans holding a word outside the you-family entirely are
// unwrapped - they mis-tagged divine pronouns and stray words - keeping the
// text they carried.
function fixYouSpans(body, stats, file, unusual) {
	return body.replace(
		/<span class="(youpl|yousg)" data-word="([^"]*)">([^<]*)<\/span>/g,
		(full, cls, word, text) => {
			// A quote in the text means the span is malformed; sync it only
			// when both halves are clean.
			const clean = !text.includes('"');
			if (clean && word !== text) {
				stats.syncedDataWord++;
				word = text;
			}
			if (!KEEP_SPAN.test(word)) {
				// Mis-tagged: a divine pronoun or a stray word. Unwrap it,
				// keeping the text it carried.
				stats.unwrapped++;
				return text;
			}
			if (!clean) {
				stats.dirtySpans++;
				return full;
			}
			if (!NINE.has(word)) {
				unusual.set(word, (unusual.get(word) || 0) + 1);
			}
			return '<span class="' + cls + '" data-word="' + word + '">' + text + "</span>";
		}
	);
}

// An empty marker the source left without its numeral. The verse itself is
// there - its text runs on in the paragraph - so the number is put back from
// the id, which is also what makes the marker a valid anchor to jump to.
function fillEmptyMarkers(body, stats) {
	return body.replace(
		/<span class="reftext" id="v(\d+)"><\/span>/g,
		(_, n) => {
			stats.emptyMarkers++;
			return '<span class="reftext" id="v' + n + '">' + n + "</span>";
		}
	);
}

// The wrapper every chapter file must sit in. Only a well-formed file, a
// file with no wrapper at all, or a file whose wrapper was never closed can
// be repaired without guessing; anything else is reported and left as it is.
function fixWrapper(body, stats, errors, file) {
	// A file cut off mid-paragraph is missing </p> tags. Close them before
	// the wrapper, or they would land outside it.
	const pOpen = countOf(body, /<p[\s>]/);
	const pClose = countOf(body, /<\/p>/);
	if (pClose < pOpen) {
		body += "</p>".repeat(pOpen - pClose);
		stats.closedP += pOpen - pClose;
	}

	const open = countOf(body, /<div/g);
	const close = countOf(body, /<\/div>/g);
	const starts = /^<div[ >]/.test(body);
	const ends = /<\/div>$/.test(body);

	if (open === 1 && close === 1 && starts && ends) {
		// already well-formed
	} else if (open === 0 && close === 0) {
		body = '<div class="calibre2">' + body + "</div>";
		stats.wrapped++;
	} else if (open === 1 && close === 0 && starts) {
		body = body + "</div>";
		stats.closed++;
	} else {
		errors.push(
			file + ": damaged structure - " + open + " <div> / " + close +
			" </div>, starts with a div: " + starts + ", ends with one: " +
			ends + " - left as it is"
		);
	}

	return body.replace(/<div>/g, '<div class="calibre2">');
}

// The marker's spacing comes from the CSS (.reftext has margin-right), and
// the contract wants no whitespace between the marker and the next word.
function stripMarkerSpace(body, stats) {
	return body.replace(
		/(<span class="reftext" id="v\d+">\d+<\/span>)[ \t\r\n]+/g,
		(_, marker) => {
			stats.markerSpaces++;
			return marker;
		}
	);
}

// ---------- validation ----------

function validate(body, file, errors, warnings) {
	// Forbidden markup
	for (const bad of ["<sup", "<script", "<style", "<!DOCTYPE", "<html", "<head", "<body"]) {
		if (new RegExp(bad + "[\\s>]").test(body)) {
			errors.push(file + ": forbidden markup: " + bad);
		}
	}
	if (/\son[a-z]+=/i.test(body)) errors.push(file + ": event-handler attribute");

	// Only the four allowed div classes
	for (const m of body.matchAll(/<div class="([^"]*)"/g)) {
		for (const cls of m[1].split(/\s+/)) {
			if (cls && !ALLOWED_DIV_CLASSES.has(cls)) {
				errors.push(file + ': forbidden div class "' + cls + '"');
			}
		}
	}

	// Verse markers: contract form, ascending, unique, leaf, id = text
	const marks = [...body.matchAll(/<span class="reftext"[^>]*>[^<]*<\/span>/g)]
		.map((m) => m[0]);
	const totalRefs = countOf(body, /class="reftext"/g);
	if (totalRefs > marks.length) {
		errors.push(file + ": " + (totalRefs - marks.length) + " verse marker(s) are not leaf spans");
	}
	if (marks.length === 0) {
		errors.push(file + ": no verse markers at all");
	}
	var prev = 0;
	const ids = [];
	for (const mark of marks) {
		const m = /^<span class="reftext" id="v(\d+)">\1<\/span>$/.exec(mark);
		if (!m) {
			errors.push(file + ": verse marker not in contract form: " + mark);
			continue;
		}
		const n = Number(m[1]);
		ids.push(n);
		if (n <= prev) {
			errors.push(file + ": verse numbering restarts at v" + n + " after v" + prev + " - duplicated content");
		} else if (n > prev + 1 && prev > 0) {
			warnings.push(file + ": verses " + (prev + 1) + "-" + (n - 1) + " are missing (merged?)");
		}
		prev = n;
	}

	// Divine name spans must carry data-name
	for (const m of body.matchAll(/<span class="(lord|caplord)"[^>]*>/g)) {
		if (!/data-name=/.test(m[0])) errors.push(file + ": lord span without data-name: " + m[0]);
	}

	// you spans must carry one of the allowed data-words
	for (const m of body.matchAll(/<span class="(youpl|yousg)"[^>]*>/g)) {
		const dw = /data-word="([^"]*)"/.exec(m[0]);
		if (!dw) errors.push(file + ": you span without data-word: " + m[0]);
		else if (!NINE.has(dw[1]) && !KEEP_SPAN.test(dw[1])) {
			errors.push(file + ': you span with unusable data-word "' + dw[1] + '"');
		}
	}

	// The three case variants and the three spelling variants come in equal
	// sets - stage 2 always emits them together.
	const caps = countOf(body, /class='cap'>/g);
	const nocaps = countOf(body, /class='nocap'>/g);
	const bsbs = countOf(body, /class='bsb'>/g);
	if (caps !== nocaps || nocaps !== bsbs) {
		errors.push(file + ": case variants unbalanced: " + caps + "/" + nocaps + "/" + bsbs);
	}
	const ca = countOf(body, /class='spell ca'>/g);
	const gb = countOf(body, /class='spell gb'>/g);
	const us = countOf(body, /class='spell us'>/g);
	if (ca !== gb || gb !== us) {
		errors.push(file + ": spelling variants unbalanced: " + ca + "/" + gb + "/" + us);
	}

	return ids;
}

// The BSB's verse numbering is the reference: a chapter that stops early is
// truncated, one that runs past it is over-numbered. Different counts with
// the same last verse just mean this translation merges verses.
function compareToBsb(file, book, chapter, ids, warnings, errors) {
	const bsbPath = join(BSB_DIR, book + "-" + chapter + ".html");
	if (!existsSync(bsbPath)) {
		warnings.push(file + ": no BSB counterpart to compare against");
		return;
	}
	if (ids.length === 0) return;
	const bsbIds = [
		...readFileSync(bsbPath, "utf8").matchAll(/<span class="reftext" id="v(\d+)">/g),
	].map((m) => Number(m[1]));
	const last = ids[ids.length - 1];
	const bsbLast = bsbIds[bsbIds.length - 1];
	if (last !== bsbLast) {
		errors.push(
			file + ": ends at verse " + last + ", the BSB ends at verse " + bsbLast +
			" - chapter looks truncated or over-numbered"
		);
	} else if (ids.length !== bsbIds.length) {
		warnings.push(
			file + ": " + ids.length + " verse markers vs the BSB's " + bsbIds.length +
			" - verses are merged"
		);
	}
}

// ---------- build ----------

async function buildTranslation(id) {
	const fromDir = join(SOURCES_DIR, id);
	const toDir = join(OUT_DIR, id);
	const names = (await readdir(fromDir)).filter((n) => n.endsWith(".html")).sort();
	await mkdir(toDir, { recursive: true });

	const errors = [];
	const warnings = [];
	const unusual = new Map();
	const stats = {
		files: 0, wrapped: 0, closed: 0, closedP: 0, colonIds: 0,
		continuations: 0, danglingSpan: 0, emptyMarkers: 0, syncedDataWord: 0,
		unwrapped: 0, dirtySpans: 0, markerSpaces: 0,
	};
	const records = [];

	for (const name of names) {
		const m = /^(.+)-(\d+)\.html$/.exec(name);
		if (!m) {
			errors.push(name + ": file name is not <slug>-<chapter>.html");
			continue;
		}
		const book = m[1];
		const chapter = String(Number.parseInt(m[2], 10));

		var body = await readFile(join(fromDir, name), "utf8");
		body = trimTrailing(body);
		body = closeDanglingTag(body, stats);
		body = fixColonIds(body, stats);
		body = dropContinuationMarkers(body, stats);
		body = fillEmptyMarkers(body, stats);
		body = fixYouSpans(body, stats, name, unusual);
		body = fixWrapper(body, stats, errors, name);
		body = stripMarkerSpace(body, stats);
		body = addVerseIds(body);

		// ---- stage 2: the markup every translation shares. This is where
		// divine pronouns and titles become cap/nocap/bsb variants.
		body = decorateChapter(body);

		const ids = validate(body, name, errors, warnings);
		compareToBsb(name, book, chapter, ids, warnings, errors);

		await writeFile(join(toDir, book + "-" + chapter + ".html"), body);
		for (const [verse, text] of extractVerseTexts(body)) {
			records.push([book, Number(chapter), verse, text]);
		}
		stats.files++;
	}

	// The search index for this translation, in canonical Bible order.
	const booksSrc = readFileSync(join("public", "books.js"), "utf8");
	const bookOrder = [...booksSrc.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
	const bookRank = new Map(bookOrder.map((slug, i) => [slug, i]));
	for (const rec of records) {
		if (!bookRank.has(rec[0])) errors.push("unknown book slug in search records: " + rec[0]);
	}
	records.sort((a, b) =>
		a[0] !== b[0] ? bookRank.get(a[0]) - bookRank.get(b[0])
		: a[1] !== b[1] ? a[1] - b[1]
		: a[2] - b[2]
	);
	await writeFile(join(toDir, "search.json"), JSON.stringify(records));

	// ---- report
	console.log("\n== " + id + ": " + stats.files + " chapters read, " + stats.files + " written");
	const fixes = [];
	if (stats.wrapped) fixes.push(stats.wrapped + " wrapped (had no wrapper div)");
	if (stats.closed) fixes.push(stats.closed + " closed (wrapper never closed)");
	if (stats.closedP) fixes.push(stats.closedP + " </p> closed");
	if (stats.colonIds) fixes.push(stats.colonIds + " verse ids in v<n>:<v> form fixed");
	if (stats.continuations) fixes.push(stats.continuations + " continuation markers (v6b) dropped");
	if (stats.danglingSpan) fixes.push(stats.danglingSpan + " cut-off </span> completed");
	if (stats.emptyMarkers) fixes.push(stats.emptyMarkers + " empty verse markers given their number");
	if (stats.syncedDataWord) fixes.push(stats.syncedDataWord + " you data-words synced to their text");
	if (stats.unwrapped) fixes.push(stats.unwrapped + " mis-tagged you spans unwrapped");
	if (stats.dirtySpans) fixes.push(stats.dirtySpans + " malformed you spans left alone");
	if (stats.markerSpaces) fixes.push(stats.markerSpaces + " spaces after verse markers removed");
	if (fixes.length) console.log("   normalized: " + fixes.join("; "));
	if (unusual.size) {
		const list = [...unusual.entries()].sort((a, b) => b[1] - a[1]);
		console.log(
			"   warning: kept " + list.reduce((n, e) => n + e[1], 0) +
			" spans with a data-word matchYou cannot conjugate: " +
			list.map((e) => e[0] + " (" + e[1] + ")").join(", ")
		);
	}
	for (const w of warnings) console.log("   warning: " + w);
	for (const e of errors) console.log("   ERROR: " + e);
	console.log("   search.json: " + records.length + " verses");

	return { errors: errors.length, warnings: warnings.length };
}

async function main() {
	const entries = await readdir(SOURCES_DIR, { withFileTypes: true });
	const all = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
	const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

	let errors = 0, warnings = 0;
	for (const id of ids) {
		const r = await buildTranslation(id);
		errors += r.errors;
		warnings += r.warnings;
	}
	console.log(
		"\n" + ids.length + " translation(s), " + errors + " error(s), " +
		warnings + " warning(s)"
	);
	if (errors) process.exitCode = 1;
}

main();
