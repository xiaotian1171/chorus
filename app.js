/* Chorus — turn your notes into a song you cannot get out of your head.
 *
 * Paste notes, pick a style, and the app writes a short song that puts the facts
 * in rhyme. It then blanks the facts back out of the lyric sheet and quizzes you
 * on them, so the song does the work of remembering. Songs you keep are saved in
 * this browser, track and all, in a personal study playlist.
 *
 * The starter song needs no account. Writing your own lyrics and hearing them
 * sung runs on your own Pollinations balance: BYOP, sign-in with PKCE.
 */

const GEN = "https://gen.pollinations.ai";
const ENTER = "https://enter.pollinations.ai";
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");

const SS = { token: "ch.token", verifier: "ch.verifier", state: "ch.state" };
const PREF = "ch.prefs";
const APPKEY = "ch.appkey";
const DEFAULT_APPKEY = "pk_DmQjyQPdqrEibkOC";

const SCREENS = ["write", "song", "quiz", "playlist"];
const SHORT_SONG = "google/lyria-3-clip-preview";
const BLANK = "＿＿＿＿";

const el = {};
const state = {
    mode: "free",
    token: "",
    screen: "write",
    style: "shanty",
    song: null,
    songModel: "",
    textModel: "",
    audio: null,
    blob: null,
    playing: false,
    quiz: null,
    playlist: [],
    saved: false,
    memoryOnly: false,
};

/* ------------------------------------------------------------------ plumbing */

function $(id) {
    return document.getElementById(id);
}

let toastTimer = null;

function toast(message, ms = 7000) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function randomToken(bytes) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function apiError(response, what) {
    let detail = "";
    try {
        const data = await response.json();
        const raw = data?.error?.message ?? data?.message ?? data?.error;
        detail = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
    } catch {
        // not JSON; the status is enough
    }
    if (response.status === 401) return `The ${what} call needs a valid Pollinations key. Sign in or paste one.`;
    if (response.status === 402 || response.status === 403) return `The ${what} call was refused${detail ? `: ${detail}` : " — check your Pollen or the key's scope"}.`;
    if (response.status === 429) return "Too many requests just now. Wait a few seconds and try again.";
    return `The ${what} call failed (${response.status})${detail ? `: ${detail}` : ""}.`;
}

async function chat(model, system, user) {
    const response = await fetch(`${GEN}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
            model: model || "openai",
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 2000,
        }),
    });
    if (!response.ok) throw new Error(await apiError(response, "lyrics"));
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "";
}

function cleanJson(text) {
    if (typeof text !== "string") return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
}

/* --------------------------------------------------------------------- songs */

function styles() {
    return window.CHORUS_STYLES || [];
}

function styleByKey(key) {
    return styles().find((entry) => entry.key === key) || styles()[0] || { key: "plain", label: "Plain", prompt: "a simple sung song" };
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineHasTerm(line, term) {
    return new RegExp(escapeRegExp(term), "i").test(String(line || ""));
}

function blankLine(line, term) {
    return String(line).replace(new RegExp(escapeRegExp(term), "i"), BLANK);
}

function clean(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function checkAnswer(input, term) {
    const given = clean(input);
    const wanted = clean(term);
    if (!given || !wanted) return false;
    if (given === wanted) return true;
    const words = wanted.split(" ");
    if (words.length < 2) return false;
    const said = given.split(" ");
    return words.every((word) => said.includes(word));
}

function validateSong(data) {
    if (!data || typeof data !== "object") return "no song came back";
    for (const field of ["title", "subject", "lyrics"]) {
        if (typeof data[field] !== "string" || !data[field].trim()) return `the song has no ${field}`;
    }
    if (!Array.isArray(data.facts) || data.facts.length < 4) return "the song tests fewer than four facts";
    const usable = data.facts.filter(
        (fact) => fact && typeof fact.term === "string" && fact.term.trim() && typeof fact.line === "string" && lineHasTerm(fact.line, fact.term),
    );
    if (usable.length < 4) return "the words it blanks out are not in the lyric lines it gave";
    for (const fact of usable) {
        if (typeof fact.meaning !== "string" || !fact.meaning.trim()) return `${fact.term} has no explanation`;
    }
    return "";
}

function normalizeSong(data, styleKey) {
    const style = styleByKey(styleKey);
    const facts = (data.facts || [])
        .filter(
            (fact) =>
                fact &&
                typeof fact.term === "string" &&
                fact.term.trim() &&
                typeof fact.line === "string" &&
                lineHasTerm(fact.line, fact.term),
        )
        .map((fact) => ({ term: fact.term.trim(), line: fact.line.trim(), meaning: String(fact.meaning || "").trim() }));
    return {
        id: `song-${Date.now()}`,
        title: String(data.title).trim(),
        style: String(data.style || style.label).trim(),
        styleKey: style.key,
        subject: String(data.subject).trim(),
        lyrics: String(data.lyrics).trim(),
        facts,
        starter: Boolean(data.starter),
        createdAt: Date.now(),
        audio: null,
    };
}

function starterSong() {
    return { ...window.CHORUS_STARTER, styleKey: "shanty", createdAt: Date.now(), audio: null };
}

async function writeSong() {
    const notes = el.notes.value.trim();
    if (notes.length < 20) {
        toast("Paste a few notes first — a list of facts, a formula sheet, anything you have to remember.");
        return;
    }
    if (state.mode !== "key") {
        toast("Writing the song runs on your own Pollen — sign in, or try the starter song.");
        return;
    }
    const style = styleByKey(state.style);
    el.writeGo.disabled = true;
    el.writeGo.textContent = "Writing…";
    try {
        const system = [
            "You turn a learner's notes into a short song they will remember. Reply with JSON only, no commentary, no code fence.",
            'Shape: {"title": string, "style": string, "subject": string, "lyrics": string, "facts": [{"term": string, "line": string, "meaning": string}]}',
            "Rules:",
            "- The song is 12 to 24 short lines: two or three verses and a chorus that comes back. Separate the lines with newlines and leave a blank line between sections. No headings, no markup, no stage directions.",
            "- Every fact the learner has to remember goes into the rhyme, in the notes' own terms. Never invent a fact, never round a number, never turn a specific term into a vague one.",
            "- 5 to 10 entries in \"facts\". \"term\" is the exact word or short phrase being tested, \"line\" is the lyric line containing that term written exactly as it appears, \"meaning\" is one plain sentence explaining it.",
            "- Every \"term\" must appear verbatim inside its own \"line\", or the quiz cannot blank it out.",
            "- Keep the vocabulary of the notes. If the notes say anastomosis, so does the song.",
            `- Sing it as ${style.prompt}.`,
        ].join("\n");
        const data = cleanJson(await chat(state.textModel, system, notes));
        const problem = validateSong(data);
        if (problem) throw new Error(`The song did not hold up (${problem}).`);
        state.song = normalizeSong(data, state.style);
        state.saved = false;
        showSong();
    } catch (error) {
        toast(`${error.message} Try again, or open the starter song.`);
    } finally {
        el.writeGo.disabled = false;
        el.writeGo.textContent = "Write the song";
    }
}

/* ------------------------------------------------------------------- playing */

let audio = null;

function stopAudio() {
    if (audio) {
        audio.pause();
        audio = null;
    }
    state.playing = false;
}

function playBlob(blob) {
    stopAudio();
    state.audio = URL.createObjectURL(blob);
    audio = new Audio(state.audio);
    audio.addEventListener("ended", () => {
        state.playing = false;
        if (state.screen === "song") paintSongButtons();
    });
    state.playing = true;
    return audio.play();
}

async function sing(song = state.song, save = false) {
    if (state.mode !== "key") {
        toast("The track is generated on your own Pollen — sign in first. The lyrics and the quiz work without it.");
        return;
    }
    el.sing.disabled = true;
    el.sing.textContent = "Singing…";
    const model = state.songModel || SHORT_SONG;
    const body = {
        model,
        input: `${song.style}. Sing these lyrics exactly, keeping the facts clear and audible:\n\n${song.lyrics}`,
        response_format: "mp3",
    };
    try {
        let response = await fetch(`${GEN}/v1/audio/speech`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(body),
        });
        if (response.status === 400) {
            const { response_format, ...plain } = body;
            response = await fetch(`${GEN}/v1/audio/speech`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(plain),
            });
        }
        if (!response.ok) throw new Error(await apiError(response, "song"));
        const blob = await response.blob();
        song.audio = blob;
        await playBlob(blob);
        if (save) await saveSong(song, true);
    } catch (error) {
        toast(error.message);
    } finally {
        el.sing.disabled = false;
        paintSongButtons();
    }
}

function paintSongButtons() {
    const song = state.song;
    if (!song) return;
    el.sing.textContent = state.playing ? "Singing…" : song.audio ? "Sing it again" : "Sing it";
    el.sing.disabled = state.playing;
    el.save.textContent = state.saved ? "Saved to your playlist" : "Save to my playlist";
    el.save.disabled = state.saved;
}

/* ------------------------------------------------------------------- the quiz */

function buildQuiz(song) {
    return {
        items: song.facts.map((fact) => ({ ...fact, blanked: blankLine(fact.line, fact.term) })),
        index: 0,
        right: 0,
        shown: 0,
        answered: false,
    };
}

function paintQuiz() {
    const quiz = state.quiz;
    const item = quiz.items[quiz.index];
    el.quizProgress.textContent = `${state.song.title} — fact ${quiz.index + 1} of ${quiz.items.length}`;
    el.quizLine.textContent = item.blanked;
    el.quizInput.value = "";
    el.quizInput.disabled = false;
    el.quizFeedback.textContent = "";
    el.check.disabled = false;
    el.reveal.disabled = false;
    el.next.classList.add("hidden");
    el.quizDone.classList.add("hidden");
    quiz.answered = false;
    state.screen = "quiz";
    render();
    el.quizInput.focus();
}

function answerQuiz(revealed) {
    const quiz = state.quiz;
    if (quiz.answered) return;
    const item = quiz.items[quiz.index];
    const right = !revealed && checkAnswer(el.quizInput.value, item.term);
    if (right) quiz.right += 1;
    if (revealed) quiz.shown += 1;
    quiz.answered = true;
    el.quizFeedback.textContent = right
        ? `Yes — ${item.term}. ${item.meaning}`
        : `${revealed ? "It is" : "Not quite — it is"} ${item.term}. ${item.meaning}`;
    el.quizInput.disabled = true;
    el.check.disabled = true;
    el.reveal.disabled = true;
    el.next.textContent = quiz.index + 1 >= quiz.items.length ? "See the score" : "Next fact";
    el.next.classList.remove("hidden");
    el.next.focus();
}

function nextFact() {
    const quiz = state.quiz;
    if (quiz.index + 1 >= quiz.items.length) {
        const known = quiz.right;
        const total = quiz.items.length;
        el.quizScore.textContent = known === total
            ? `All ${total} of them. Sing it again tomorrow and they are yours.`
            : `You knew ${known} of ${total}. The chorus has the rest — sing it twice and try again.`;
        el.quizLine.textContent = "";
        el.quizInput.classList.add("hidden");
        el.check.classList.add("hidden");
        el.reveal.classList.add("hidden");
        el.quizFeedback.textContent = "";
        el.quizDone.classList.remove("hidden");
        el.next.classList.add("hidden");
        return;
    }
    quiz.index += 1;
    paintQuiz();
}

function paintPlaylist() {
    el.playlistList.innerHTML = "";
    if (!state.playlist.length) {
        const empty = document.createElement("p");
        empty.className = "fine";
        empty.textContent = "Nothing saved yet. Write a song and press save — it keeps the lyrics, the facts and the track.";
        el.playlistList.append(empty);
    }
    for (const song of state.playlist) {
        const block = document.createElement("article");
        block.className = "note-block";
        const head = document.createElement("h3");
        head.textContent = song.title;
        const meta = document.createElement("p");
        meta.className = "fine";
        meta.textContent = `${song.style} — ${song.facts.length} facts${song.audio ? ", track saved" : ", no track saved"}`;
        const row = document.createElement("div");
        row.className = "row tight";

        const play = document.createElement("button");
        play.className = "btn small";
        play.textContent = song.audio ? "Play" : "Sing it";
        play.addEventListener("click", async () => {
            state.song = song;
            state.saved = true;
            if (song.audio) {
                showSong();
                await playBlob(song.audio);
                paintSongButtons();
            } else {
                showSong();
                await sing(song, true);
            }
        });

        const quiz = document.createElement("button");
        quiz.className = "btn ghost small";
        quiz.textContent = "Quiz me";
        quiz.addEventListener("click", () => {
            state.song = song;
            state.saved = true;
            state.quiz = buildQuiz(song);
            el.quizInput.classList.remove("hidden");
            el.check.classList.remove("hidden");
            el.reveal.classList.remove("hidden");
            paintQuiz();
        });

        const open = document.createElement("button");
        open.className = "btn ghost small";
        open.textContent = "Open the lyrics";
        open.addEventListener("click", () => {
            state.song = song;
            state.saved = true;
            showSong();
        });

        const remove = document.createElement("button");
        remove.className = "btn ghost small";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
            if (!confirm(`Delete "${song.title}" from this browser? The lyrics and the track go with it.`)) return;
            await removeSong(song.id);
            await loadPlaylist();
            paintPlaylist();
        });

        row.append(play, quiz, open, remove);
        block.append(head, meta, row);
        el.playlistList.append(block);
    }
    el.playlistNote.textContent = state.memoryOnly
        ? "This browser would not give the page a database, so the playlist lives in this tab only."
        : "Saved in this browser's own storage, on this device. Nothing is uploaded anywhere.";
    state.screen = "playlist";
    render();
}

/* ------------------------------------------------------------- the local store */

const DB_NAME = "chorus";
const STORE = "songs";
let db = null;

function openDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("no database"));
            return;
        }
        const request = window.indexedDB.open(DB_NAME, 1);
        request.addEventListener("upgradeneeded", () => {
            const opened = request.result;
            if (!opened.objectStoreNames.contains(STORE)) opened.createObjectStore(STORE, { keyPath: "id" });
        });
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error || new Error("no database")));
    });
}

async function withStore(mode, run) {
    if (!db) {
        try {
            db = await openDb();
        } catch {
            state.memoryOnly = true;
            return null;
        }
    }
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = run(store);
        transaction.addEventListener("complete", () => resolve(request?.result ?? null));
        transaction.addEventListener("error", () => resolve(null));
        transaction.addEventListener("abort", () => resolve(null));
    });
}

async function loadPlaylist() {
    const all = await withStore("readonly", (store) => store.getAll());
    if (all) {
        state.playlist = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return;
    }
    state.playlist = state.playlist || [];
}

async function saveSong(song, quiet = false) {
    const record = { ...song };
    const done = await withStore("readwrite", (store) => store.put(record));
    state.saved = true;
    if (state.memoryOnly && !state.playlist.some((entry) => entry.id === song.id)) state.playlist.unshift(record);
    await loadPlaylist();
    paintSongButtons();
    if (!quiet) toast(done === null && !state.memoryOnly ? "That could not be saved." : `Saved "${song.title}" to your playlist.`);
}

async function removeSong(id) {
    await withStore("readwrite", (store) => store.delete(id));
}

/* ------------------------------------------------------------------ the screens */

function render() {
    for (const name of SCREENS) el[name].classList.toggle("hidden", state.screen !== name);
}

function showSong() {
    const song = state.song;
    el.songStyle.textContent = song.style;
    el.songTitle.textContent = song.title;
    el.songSubject.textContent = song.starter
        ? `${song.subject} — the starter song, no account needed.`
        : song.subject;
    el.lyrics.innerHTML = "";
    const terms = song.facts.map((fact) => fact.term);
    for (const line of song.lyrics.split("\n")) {
        const node = document.createElement("p");
        if (!line.trim()) {
            node.className = "gap";
        } else {
            const hit = terms.find((term) => lineHasTerm(line, term));
            if (hit) {
                const parts = line.split(new RegExp(`(${escapeRegExp(hit)})`, "i"));
                for (const part of parts) {
                    if (part.toLowerCase() === hit.toLowerCase()) {
                        const mark = document.createElement("mark");
                        mark.textContent = part;
                        node.append(mark);
                    } else {
                        node.append(document.createTextNode(part));
                    }
                }
            } else {
                node.textContent = line;
            }
        }
        el.lyrics.append(node);
    }
    const model = state.songModel || SHORT_SONG;
    el.singNote.textContent = song.audio
        ? "The track is saved with this song."
        : `"Sing it" generates the track with ${model} on your own Pollen. ${
              model === SHORT_SONG ? "That is a 30-second song with vocals." : "That is a full-length track and takes longer."
          }`;
    paintSongButtons();
    state.screen = "song";
    render();
}

/* --------------------------------------------------------------------- auth */

function useKey(token, scope) {
    state.token = token;
    state.mode = "key";
    sessionStorage.setItem(SS.token, token);
    el.mode.textContent = scope?.includes("usage") ? "your own pollen" : "your own key";
    el.mode.classList.add("on");
    el.signin.classList.add("hidden");
    el.signout.classList.remove("hidden");
    el.signinBox.open = false;
    el.setupNote.textContent = "Signed in. Your notes stay in this tab; the lyrics and the track are written on your own Pollen.";
    syncMode();
    refreshWallet();
    loadModels();
    savePrefs();
}

function signOut() {
    state.token = "";
    state.mode = "free";
    sessionStorage.removeItem(SS.token);
    el.mode.textContent = "not signed in";
    el.mode.classList.remove("on");
    el.signin.classList.remove("hidden");
    el.signout.classList.add("hidden");
    el.wallet.classList.add("hidden");
    el.setupNote.textContent = "Nothing here is stored on a server. The starter song works with no account at all — a full lyric sheet and a quiz. Writing your own song and hearing it sung runs on your own Pollinations balance: sign in and it stays yours.";
    syncMode();
    savePrefs();
}

async function startAuth() {
    const appkey = el.appkey.value.trim();
    if (appkey) localStorage.setItem(APPKEY, appkey);
    else localStorage.removeItem(APPKEY);
    const verifier = randomToken(32);
    const nonce = randomToken(16);
    sessionStorage.setItem(SS.verifier, verifier);
    sessionStorage.setItem(SS.state, nonce);
    const params = new URLSearchParams({
        response_type: "code",
        redirect_uri: APP_URL,
        client_id: appkey || DEFAULT_APPKEY,
        scope: "profile usage",
        state: nonce,
        code_challenge: await s256(verifier),
        code_challenge_method: "S256",
        expiry: "30",
        budget: "25",
    });
    location.href = `${ENTER}/authorize?${params}`;
}

async function finishAuth(code, returnedState) {
    const verifier = sessionStorage.getItem(SS.verifier);
    const expected = sessionStorage.getItem(SS.state);
    sessionStorage.removeItem(SS.verifier);
    sessionStorage.removeItem(SS.state);
    if (!verifier) throw new Error("That sign-in attempt expired. Press sign in again.");
    if (expected && returnedState && expected !== returnedState) throw new Error("The sign-in state did not match. Press sign in again.");
    const appkey = localStorage.getItem(APPKEY);
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: APP_URL,
        code_verifier: verifier,
        client_id: appkey || DEFAULT_APPKEY,
    });
    const response = await fetch(`${ENTER}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!response.ok) throw new Error(await apiError(response, "sign-in"));
    const data = await response.json();
    if (!data?.access_token) throw new Error("No key came back from sign-in.");
    useKey(data.access_token, data.scope || "");
}

async function refreshWallet() {
    if (!state.token) {
        el.wallet.classList.add("hidden");
        return;
    }
    try {
        const response = await fetch(`${GEN}/account/balance`, { headers: authHeaders() });
        if (!response.ok) return;
        const value = findNumber(await response.json());
        if (value === null) return;
        el.wallet.textContent = `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} pollen`;
        el.wallet.title = "Your Pollinations balance";
        el.wallet.classList.remove("hidden");
    } catch {
        // the balance chip is a nicety, never a blocker
    }
}

function findNumber(data, depth = 0) {
    if (depth > 2 || !data || typeof data !== "object") return null;
    for (const key of ["pollen", "balance", "available", "remaining", "total", "amount"]) {
        if (typeof data[key] === "number") return data[key];
    }
    for (const value of Object.values(data)) {
        const found = findNumber(value, depth + 1);
        if (found !== null) return found;
    }
    return null;
}

/* --------------------------------------------------------------------- models */

async function listModels(kind) {
    const response = await fetch(`${GEN}/${kind}/models`);
    if (!response.ok) return [];
    const data = await response.json();
    const list = Array.isArray(data) ? data : data?.data ?? [];
    return list.filter((model) => model && typeof model === "object");
}

function fillSelect(select, items, selected, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = placeholder;
        select.append(option);
    }
    for (const item of items) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.append(option);
    }
    if (selected) {
        if (![...select.options].some((option) => option.value === selected)) {
            const option = document.createElement("option");
            option.value = selected;
            option.textContent = selected;
            select.prepend(option);
        }
        select.value = selected;
    }
    if (!select.value && select.options.length) select.selectedIndex = 0;
}

const SONG_HINTS = {
    "google/lyria-3-clip-preview": "30-second song with vocals — cheapest",
    "google/lyria-3.5": "full-length track",
    "elevenlabs/music-v2.5": "full-length track",
    "elevenlabs/music-v2": "full-length track",
};

async function loadModels() {
    if (state.mode !== "key") return;
    try {
        const [texts, audios] = await Promise.all([listModels("text"), listModels("audio")]);
        fillSelect(
            el.textModel,
            texts
                .filter((model) => !model.community && model.name)
                .map((model) => ({ value: model.name, label: model.name })),
            state.textModel,
            "openai",
        );
        const songs = audios.filter(
            (model) => !model.community && model.name && (model.supported_endpoints || []).includes("/v1/audio/speech") && /music|lyria|audio-3/i.test(model.name),
        );
        fillSelect(
            el.songModel,
            songs.map((model) => ({ value: model.name, label: `${model.name}${SONG_HINTS[model.name] ? ` — ${SONG_HINTS[model.name]}` : ""}` })),
            state.songModel || SHORT_SONG,
            SHORT_SONG,
        );
    } catch {
        // keep whatever is already in the selects
    }
}

function syncMode() {
    const free = state.mode === "free";
    for (const node of [el.textModel, el.songModel]) node.disabled = free;
    el.textModel.title = free ? "Sign in to choose the model that writes the lyrics" : "";
    el.songModel.title = free ? "Sign in to choose the model that sings it" : "";
    el.authNote.textContent = free
        ? "Sign-in is the authorization-code flow with PKCE. Nothing is stored beyond this tab."
        : "Signed in. Your key lives in this tab only; close the tab and it is gone.";
}

/* --------------------------------------------------------------------- prefs */

function savePrefs() {
    try {
        localStorage.setItem(
            PREF,
            JSON.stringify({
                style: state.style,
                textModel: el.textModel.value || state.textModel,
                songModel: el.songModel.value || state.songModel,
            }),
        );
    } catch {
        // private mode; preferences are a nicety
    }
}

function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREF) || "{}");
        if (typeof saved.style === "string" && styleByKey(saved.style).key === saved.style) state.style = saved.style;
        if (typeof saved.textModel === "string") state.textModel = saved.textModel;
        if (typeof saved.songModel === "string") state.songModel = saved.songModel;
    } catch {
        // nothing saved yet
    }
}

/* ---------------------------------------------------------------------- wire */

function buildStyles() {
    el.styleChips.innerHTML = "";
    for (const style of styles()) {
        const chip = document.createElement("button");
        chip.className = `chip-btn${style.key === state.style ? " on" : ""}`;
        chip.textContent = style.label;
        chip.addEventListener("click", () => {
            state.style = style.key;
            buildStyles();
            savePrefs();
        });
        el.styleChips.append(chip);
    }
}

function wire() {
    for (const id of [
        "write", "notes", "style-chips", "text-model", "song-model", "write-go", "starter", "setup-note",
        "signin-box", "oauth", "pastekey", "usekey", "appkey", "auth-note",
        "wallet", "mode", "signin", "signout", "to-playlist", "toast",
        "song", "song-style", "song-title", "song-subject", "lyrics", "sing-note", "sing", "quiz-me", "save", "back",
        "quiz", "quiz-progress", "quiz-line", "quiz-input", "check", "reveal", "quiz-feedback", "next",
        "quiz-done", "quiz-score", "quiz-again", "quiz-back",
        "playlist", "playlist-list", "playlist-note", "back-from-playlist",
    ]) {
        const key = id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
        el[key] = $(id);
    }

    el.writeGo.addEventListener("click", writeSong);
    el.starter.addEventListener("click", () => {
        state.song = starterSong();
        state.saved = false;
        showSong();
    });
    el.sing.addEventListener("click", () => sing());
    el.save.addEventListener("click", () => saveSong(state.song));
    el.quizMe.addEventListener("click", () => {
        state.quiz = buildQuiz(state.song);
        el.quizInput.classList.remove("hidden");
        el.check.classList.remove("hidden");
        el.reveal.classList.remove("hidden");
        paintQuiz();
    });
    el.check.addEventListener("click", () => answerQuiz(false));
    el.reveal.addEventListener("click", () => answerQuiz(true));
    el.next.addEventListener("click", nextFact);
    el.quizAgain.addEventListener("click", () => {
        state.quiz = buildQuiz(state.song);
        el.quizInput.classList.remove("hidden");
        el.check.classList.remove("hidden");
        el.reveal.classList.remove("hidden");
        paintQuiz();
    });
    el.quizBack.addEventListener("click", showSong);
    el.quizInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") answerQuiz(false);
    });
    el.back.addEventListener("click", () => {
        stopAudio();
        state.screen = "write";
        render();
    });
    el.toPlaylist.addEventListener("click", async () => {
        if (state.screen === "playlist") {
            state.screen = "write";
            render();
            return;
        }
        await loadPlaylist();
        paintPlaylist();
    });
    el.backFromPlaylist.addEventListener("click", () => {
        state.screen = "write";
        render();
    });
    el.oauth.addEventListener("click", () => startAuth().catch((error) => toast(error.message)));
    el.usekey.addEventListener("click", () => {
        const token = el.pastekey.value.trim();
        if (!token) {
            toast("Paste a key first.");
            return;
        }
        el.pastekey.value = "";
        useKey(token, "");
    });
    el.signout.addEventListener("click", signOut);
    el.songModel.addEventListener("change", () => {
        state.songModel = el.songModel.value;
        savePrefs();
        if (state.song) showSong();
    });
    el.textModel.addEventListener("change", savePrefs);
}

function init() {
    wire();
    loadPrefs();
    buildStyles();
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const returned = params.get("state");
    if (code) {
        history.replaceState({}, "", location.pathname);
        finishAuth(code, returned)
            .then(() => toast("Signed in. Your own song is one paste away."))
            .catch((error) => toast(error.message));
    }
    const stored = sessionStorage.getItem(SS.token);
    if (stored) {
        state.token = stored;
        state.mode = "key";
        el.mode.textContent = "your own key";
        el.mode.classList.add("on");
        el.signin.classList.add("hidden");
        el.signout.classList.remove("hidden");
    }
    el.appkey.value = localStorage.getItem(APPKEY) || DEFAULT_APPKEY;
    syncMode();
    render();
    loadPlaylist();
    if (state.mode === "key") {
        refreshWallet();
        loadModels();
    }
}

if (typeof document !== "undefined" && typeof window !== "undefined" && !window.__CHORUS_TEST__) {
    init();
}
