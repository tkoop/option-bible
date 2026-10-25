# sources/

Raw, hand-supplied translation HTML - one directory per translation, named
with the same `id` that will go in `public/translations.js` and under
`public/translations/`.

    sources/<id>/<book-slug>-<chapter>.html

These are inputs only; nothing here is served. Each translation gets a
stage 1 script that reads from here, normalizes the file to the contract in
`CHAPTER_HTML_FORMAT.md` (verse ids, footnote block, wrapper div), and runs
`decorateChapter()` to add the case and spelling variants. The output goes to
`public/translations/<id>/`.

Prefer naming each file `<book-slug>-<chapter>.html` (the slugs in
`public/books.js` are the source of truth), e.g. `genesis-1.html`,
`1-chronicles-12.html`. If the files arrive named differently, the stage 1
script for that translation maps the names.

Unlike `bsb/` (the unzipped epub `compile.mjs` reads), this tree is organized
per translation so a second, third, fourth translation needs no changes to
the existing pipelines.
