var settings = {
	browseHistory: [],
	fontSize: 16,
	font: "sourceSerif",
	mode: "auto",
	spelling: "ca",
	name: "Yahweh",
	case: "upper",
	titles: false,
	footnotes: false,
	references: false,
	verses: false,
	you: "youpl",
	woc: false,
	style: "bsb",
	order: "canonical",
	pageturning: false,
	wordStudyLinks: false,
	activity: "default",
	readRate: 1,
	readVoice: "",
	showAdvanced: false,
};

// settings.fontSize is a preference, not a pixel count: it is rendered at
// settings.fontSize * FONT_SCALE, so the historic 16 default reads as 20px.
var FONT_SCALE = 1.25;

registerEventListener(
	(e) => e.name == "addBrowseHistory",
	function (event) {
		settings.browseHistory.push(event.data);
		saveSettingsToLocalStorage();
	}
);

registerEventListener(
		(e) => e.name == "setSetting",
		function (event) {
			settings[event.setting] = event.value;

			fireEvent({ name: "settingsUpdated" });
			saveSettingsToLocalStorage();
		},
	);

// A shared link carries the four settings the version tag is built from, so the
// chapter opens as it was shared: "#Gen-1?s=us&n=YHWH&c=upper&y=youall". A URL is
// untrusted input, and these four values end up in the page - settings.name
// goes through innerHTML, settings.spelling into a CSS selector - so only the
// values the gear menu offers are taken.
var shareableSettings = {
	s: "spelling",
	n: "name",
	c: "case",
	y: "you",
	t: "style",
};

var shareableValues = {
	spelling: ["ca", "gb", "us"],
	name: [
		"Yahweh",
		"LORD",
		"Jehovah",
		"YHWH",
		"YHVH",
		"HaShem",
		"Adonai",
		"Elohim",
		"G-d",
		"God",
	],
	case: ["lower", "upper", "bsb"],
	you: ["you", "youcoloured", "youpl", "youall", "yall", "youguys"],
	style: ["bsb", "college-professor", "grade-4", "grade-8", "grade-12"],
};

// Compact encoding of all five shareable settings as the "O-..." version tag
// used in the chapter title, so a share URL can carry them as one short token.
var versionTagLetters = {
	spelling: function (v) {
		return v == "gb" ? "B" : v.substr(0, 1).toUpperCase();
	},
	name: function (v) {
		if (v == "G-d") return "D";
		if (v == "YHWH") return "W";
		if (v == "YHVH") return "V";
		return v.substr(0, 1).toUpperCase();
	},
	case: function (v) {
		return v.substr(0, 1).toUpperCase();
	},
	you: function (v) {
		switch (v) {
			case "youall":
				return "A";
			case "yall":
				return "V";
			case "youguys":
				return "G";
			case "youcoloured":
				return "C";
			case "youpl":
				return "P";
			default:
				return "Y";
		}
	},
	style: function (v) {
		switch (v) {
			case "college-professor":
				return "P";
			case "grade-4":
				return "4";
			case "grade-8":
				return "8";
			case "grade-12":
				return "T";
			default:
				return "B";
		}
	},
};

var versionTagToValue = {
	spelling: { C: "ca", B: "gb", U: "us" },
	name: {
		Y: "Yahweh",
		L: "LORD",
		J: "Jehovah",
		W: "YHWH",
		V: "YHVH",
		H: "HaShem",
		A: "Adonai",
		E: "Elohim",
		D: "G-d",
		G: "God",
	},
	case: { L: "lower", U: "upper", B: "bsb" },
	you: {
		Y: "you",
		C: "youcoloured",
		P: "youpl",
		A: "youall",
		V: "yall",
		G: "youguys",
	},
	style: {
		B: "bsb",
		P: "college-professor",
		4: "grade-4",
		8: "grade-8",
		T: "grade-12",
	},
};

function versionTag() {
	return (
		"O-" +
		versionTagLetters.spelling(settings.spelling) +
		versionTagLetters.name(settings.name) +
		versionTagLetters.case(settings.case) +
		versionTagLetters.you(settings.you) +
		versionTagLetters.style(settings.style)
	);
}

function parseVersionTag(tag) {
	if (typeof tag != "string" || !/^O-/i.test(tag)) return null;
	var letters = tag.slice(2);
	if (letters.length != 5) return null;
	var keys = ["spelling", "name", "case", "you", "style"];
	var out = {};
	for (var i = 0; i < keys.length; i++) {
		var setting = keys[i];
		var letter = letters.charAt(i).toUpperCase();
		var value = versionTagToValue[setting][letter];
		if (!value) return null;
		if (shareableValues[setting].indexOf(value) == -1) return null;
		out[setting] = value;
	}
	return out;
}

// Settings that came from a shared link belong to the sharer, not the reader:
// they are applied to the page but never written back to localStorage, so the
// reader's own choices are still there on the next visit. Each one keeps the
// value it displaced here, so the reader can have their own back - see
// discardSharedSettings - or keep what the link brought for good.
var sharedSettings = {};

function usingSharedSettings() {
	return Object.keys(sharedSettings).length > 0;
}

function ownSetting(name) {
	return name in sharedSettings ? sharedSettings[name] : settings[name];
}

function releaseSharedSettings() {
	Object.keys(sharedSettings).forEach(function (name) {
		settings[name] = sharedSettings[name];
	});
	sharedSettings = {};
}

// Called for every chapter hash, shared or not: a hash carrying no settings
// hands the reader their own back.
function applySharedSettings(query) {
	releaseSharedSettings();

	var shared = {};
	if (query) {
		var q = query.replace(/^\?/, "");
		// Compact form: the whole version tag, "O-CYLPB", carries all five
		// shareable settings in one short token.
		if (/^O-/i.test(q) && q.indexOf("&") == -1 && q.indexOf("=") == -1) {
			var parsed = parseVersionTag(q);
			if (parsed) {
				Object.keys(parsed).forEach(function (name) {
					shared[name] = parsed[name];
				});
			}
		} else {
			q.split("&").forEach(function (pair) {
				var at = pair.indexOf("=");
				if (at == -1) return;
				var setting = shareableSettings[decodeURIComponent(pair.slice(0, at))];
				if (!setting) return;
				var value = decodeURIComponent(pair.slice(at + 1));
				if (shareableValues[setting].indexOf(value) == -1) return;
				shared[setting] = value;
			});
		}
	}

	Object.keys(shared).forEach(function (name) {
		sharedSettings[name] = settings[name];
		settings[name] = shared[name];
	});

	if (usingSharedSettings()) fireEvent({ name: "settingsUpdated" });
}

function settingsQuery(names) {
	var pairs = [];
	Object.keys(shareableSettings).forEach(function (key) {
		var setting = shareableSettings[key];
		if (names.indexOf(setting) == -1) return;
		pairs.push(key + "=" + encodeURIComponent(settings[setting]));
	});
	return pairs.length ? "?" + pairs.join("&") : "";
}

// What the share dialog offers: the compact version tag, so the chapter opens
// the way it looks to the sender however the reader got there, in one short token.
function versionQuery() {
	return "?" + versionTag();
}

// The address bar carries the settings a shared link brought. When all five were
// displaced (the normal share case) carry them as the compact tag; otherwise
// keep the per-setting form so a partial shared set keeps its subset semantics.
function sharedSettingsQuery() {
	var displaced = Object.keys(sharedSettings);
	var all = Object.values(shareableSettings);
	var allDisplaced = all.length > 0 && all.every(function (s) {
		return displaced.indexOf(s) != -1;
	});
	if (allDisplaced) return "?" + versionTag();
	return settingsQuery(displaced);
}

// The address bar carries the settings a shared link brought, so that the
// version on screen survives a reload. Once the reader has dealt with them one
// way or the other there is nothing to carry, and the bar loses the query.
function updateSharedHash() {
	var hash = location.hash;
	if (!hash || hash == "#") return;
	var at = hash.indexOf("?");
	var base = at == -1 ? hash : hash.slice(0, at);
	var full = base + sharedSettingsQuery();
	history.replaceState(full, "", full);
}

// Adopt: what the link brought becomes the reader's own setting, and the address
// bar stops describing it as somebody else's. The settings already hold what the
// link brought - that is what is on screen - so all that has to go is the
// bookkeeping that was keeping it out of localStorage. Only the shared settings
// are touched; anything the link left out was never changed and stays the
// reader's own.
function adoptSharedSettings() {
	sharedSettings = {};
	updateSharedHash();
	saveSettingsToLocalStorage();
	fireEvent({ name: "settingsUpdated" });
}

// Discard: the link's settings go, and the reader's own come back. Nothing was
// written to localStorage while they were in use, so there is nothing to undo
// there - only what is on screen to put right.
function discardSharedSettings() {
	releaseSharedSettings();
	updateSharedHash();
	fireEvent({ name: "settingsUpdated" });
}

function todayDateString() {
	var d = new Date();
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

function normalizeDateString(date) {
	if (typeof date == "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
	// legacy format like "Wed Sep 23" (no year, stored by older builds)
	var parsed = new Date(Date.parse(date));
	if (isNaN(parsed.getTime())) return date;
	var d = new Date(parsed);
	d.setFullYear(new Date().getFullYear());
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

function loadSettingsFromLocalStorage() {
	var localStorageSettings = JSON.parse(localStorage?.settings ?? "{}");

	settings.fontSize = localStorageSettings?.fontSize ?? 16;
	settings.font = localStorageSettings?.font ?? "sourceSerif";
	settings.mode =
		localStorageSettings?.mode ??
		(localStorageSettings?.darkMode ? "dark" : "auto");
	settings.spelling = localStorageSettings?.spelling ?? "ca";
	// "Yaweh" was a typo here, and it mattered beyond this app's own text: it is
// not one of the values a shared link may carry, so a reader on the default
// could not share their choice of name at all.
settings.name = localStorageSettings?.name ?? "Yahweh";
	settings.case = localStorageSettings?.case ?? "lower";
	settings.titles = localStorageSettings?.titles ?? false;
	settings.footnotes = localStorageSettings?.footnotes ?? false;
	settings.references = localStorageSettings?.references ?? false;
	settings.verses = localStorageSettings?.verses ?? false;
	settings.you = localStorageSettings?.you ?? "youpl";
	settings.woc = localStorageSettings?.woc ?? false;
	settings.wordStudyLinks = localStorageSettings?.wordStudyLinks ?? false;
	settings.style = localStorageSettings?.style ?? "bsb";
	if (shareableValues.style.indexOf(settings.style) == -1) settings.style = "bsb";
	settings.browseHistory = JSON.parse(localStorage?.browseHistory ?? "[]");

	// normalize legacy date strings and persist the cleanup if anything changed
	var migrated = false;
	settings.browseHistory.forEach(function (entry) {
		if (entry && entry.date) {
			var normalized = normalizeDateString(entry.date);
			if (normalized != entry.date) {
				entry.date = normalized;
				migrated = true;
			}
		}
	});
	if (migrated) saveSettingsToLocalStorage();
	settings.order =
		localStorageSettings?.order ??
		(localStorage.bibleOrder == "chronological" ? "chronological" : "canonical");
	settings.pageturning = localStorageSettings?.pageturning ?? false;
	settings.activity = isActivityType(localStorageSettings?.activity)
		? localStorageSettings.activity
		: "default";
	settings.readRate = Math.min(
		2,
		Math.max(0.5, Number(localStorageSettings?.readRate) || 1),
	);
	settings.readVoice = localStorageSettings?.readVoice ?? "";
	settings.showAdvanced = localStorageSettings?.showAdvanced ?? false;

	fireEvent({ name: "settingsUpdated" });
}
loadSettingsFromLocalStorage();

function saveSettingsToLocalStorage() {
	var localStorageSettings = {
		fontSize: settings.fontSize,
		font: settings.font,
		mode: settings.mode,
		spelling: ownSetting("spelling"),
		name: ownSetting("name"),
		case: ownSetting("case"),
		you: ownSetting("you"),
		titles: settings.titles,
		footnotes: settings.footnotes,
		references: settings.references,
		verses: settings.verses,
		woc: settings.woc,
		order: settings.order,
		pageturning: settings.pageturning,
		wordStudyLinks: settings.wordStudyLinks,
		style: ownSetting("style"),
		activity: settings.activity,
		readRate: settings.readRate,
		readVoice: settings.readVoice,
		showAdvanced: settings.showAdvanced,
	};

	localStorage.settings = JSON.stringify(localStorageSettings);
	localStorage.browseHistory = JSON.stringify(settings.browseHistory);
}
