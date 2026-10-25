// One entry per translation the app can read. `path` is the directory under
// public/ holding that translation's chapter files, named the same way as the
// entry's `id`. The raw input for each one lives in sources/<id> and is built
// into public/translations/<id> by that translation's stage 1 script.
//
// Only the BSB is built today, so which one a reader is reading is not a
// setting yet - it is whatever is first in this list. Adding a second one is
// what turns currentTranslation() into a choice.
var translations = [
	{
		id: "bsb",
		name: "Berean Standard Bible",
		path: "translations/bsb",
		supportsWordStudy: true,
	},
	{
		id: "college-professor",
		name: "College Professor",
		path: "translations/college-professor",
		supportsWordStudy: false,
	},
	{
		id: "grade-4",
		name: "Grade 4",
		path: "translations/grade-4",
		supportsWordStudy: false,
	},
	{
		id: "grade-8",
		name: "Grade 8",
		path: "translations/grade-8",
		supportsWordStudy: false,
	},
	{
		id: "grade-12",
		name: "Grade 12",
		path: "translations/grade-12",
		supportsWordStudy: false,
	},
];

function currentTranslation() {
	var id = (typeof settings !== "undefined" && settings.style) ? settings.style : "bsb";
	for (var i = 0; i < translations.length; i++) {
		if (translations[i].id === id) return translations[i];
	}
	return translations[0];
}

function chapterUrl(slug, chapter) {
	return "./" + currentTranslation().path + "/" + slug + "-" + chapter + ".html";
}

function searchUrl() {
	var t = currentTranslation();
	return "./" + (t.id === "bsb" ? "search.json" : t.path + "/search.json");
}

function supportsWordStudy() {
	return currentTranslation().supportsWordStudy === true;
}