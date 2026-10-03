# Chorus

Turn your notes into a song you cannot get out of your head.

**Play it:** https://xiaotian1171.github.io/chorus/
**Built for:** [Pollinations Quest #15727](https://github.com/pollinations/pollinations/issues/15727) — songs to remember facts.

## What it is

Paste the notes you keep failing to remember — a fact list, a formula sheet, the
seven layers, the cranial nerves, the irregular verbs — pick a style, and the app
writes a short song out of them. The facts you have to know go into the rhyme, in
your notes' own words, and the chorus repeats them until they stick.

Then it quizzes you on the same song: each key word is blanked out of the line that
carries it, and you type it back. The song is the answer key. Everything you make
goes into a study playlist that lives in your browser, track and all.

It opens with a complete starter song — *Seven Layers (The OSI Shanty)* — that needs
no key at all: read the lyric sheet, take the quiz, keep it in the playlist.

## How it runs

1. **The desk** — paste your notes, pick a style (sea shanty, lo-fi, 80s power
   ballad, marching band, blues, synthwave, rap, folk), pick which model writes the
   lyrics and which one sings, and write the song.
2. **The song** — the lyric sheet, with every fact you will be tested on marked in
   it. Sing it: the track is generated from the style and the lyrics. Save it to the
   playlist when you like it.
3. **The quiz** — one fact at a time, with the key word missing from the line that
   contains it. Type it, or give up and see the answer with a one-line explanation.
   A multi-word fact counts when all of its words are there; case and punctuation
   do not matter.
4. **The playlist** — every song you save, with its track, kept in this browser.
   Play it, take its quiz again, or throw it away.

## Offline and signed in

Signed out you can play the starter song, read the lyric sheet, take the quiz and
keep a playlist. Writing your own song and hearing it sung need a signed-in key,
because both are billed to your own Pollen — signed out, the app says so instead of
failing halfway.

## Bring your own Pollen

Sign in with the button at the desk (OAuth + PKCE against `enter.pollinations.ai`,
scope `profile usage`, budget capped at 25 Pollen, token kept in `sessionStorage`
only) or paste an API key. Everything is then billed to you, not to this app.

## Run it locally

```
git clone https://github.com/xiaotian1171/chorus.git   # any static server will do
cd chorus && python3 -m http.server 8080
# then open http://localhost:8080/
```

No build step, no dependencies, no backend.

## Tests

```
node test.mjs
```

52 checks over the parts that break quietly: that every style is complete and
looked up by key; that the starter song validates, that its facts really appear in
its own lyrics and that each fact's line really contains its term; that blanking a
line removes the word and leaves the rest; that answer marking forgives case,
punctuation, spacing and word order but not a wrong or missing word; that bad songs
are refused (no title, no lyrics, fewer than four facts, a fact that is not in its
line, a fact with no explanation) and that normalising throws away facts that
cannot be quizzed; and that the page and the script agree — no duplicate ids, every
element the app reaches for is wired up, every wired id exists, every screen the
renderer switches is wired up and reachable.

## Pollinations endpoints

Both are in `app.js`:

- `writeSong()` → `POST /v1/chat/completions` on `gen.pollinations.ai` — turns the
  notes into the lyric sheet plus the fact list (JSON), with the chosen style in the
  prompt and the notes' own vocabulary preserved.
- `sing()` → `POST /v1/audio/speech` on `gen.pollinations.ai`, with a music model
  and the style + lyrics as the input:
  - `google/lyria-3-clip-preview` (default) — a 30-second song with vocals,
  - `google/lyria-3.5` and `elevenlabs/music-v2.5` — full-length tracks.

  The model list is read from `/audio/models`, so the picker only offers models that
  really advertise the speech endpoint. A 30-second clip arrives in seconds; the
  full-length models take considerably longer.

## What it stores

The playlist lives in IndexedDB in your browser (`chorus` → `songs`): the title,
style, subject, lyrics, the fact list and the generated audio, so a saved song
replays without being generated again. Preferences and the API key live in
`localStorage`; the OAuth token lives in `sessionStorage` and dies with the tab.
Nothing is sent anywhere except to Pollinations, and there is no backend.

## Cost

One song = one chat call plus one audio generation. With the default 30-second
model that is a few Pollen at most, and it is your Pollen, spent only when you press
**Sing it**. The starter song and the quiz cost nothing.

## Known limits

- Signed out, the quiz is the whole app; writing and singing need a key.
- The lyric writer is an LLM: it occasionally drops a fact from the rhyme, which is
  why facts whose line does not contain their term are thrown away before the quiz
  is built.
- A full-length track can take a while. The 30-second clip is the default for that
  reason.
- The playlist is per-browser. Clearing site data clears it, tracks included.

## Verified

Walked in a real browser (Chrome on a cloud desktop, 2026-10-03) against the
deployed page — see the screenshots below.

Not covered by that run: writing a song and singing it, because both spend the
visitor's Pollen and no key was signed in. The code path is `writeSong()` and
`sing()`; both are behind the sign-in gate, and signed out the app refuses them
with a message rather than failing.

## Licence

MIT.
