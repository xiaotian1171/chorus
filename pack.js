/* Chorus — the starter song, and the styles a learner can pick from.
 *
 * The starter exists so the app is worth opening before anyone signs in: a
 * complete lyric sheet with seven facts and a quiz built from them, no network
 * needed. The track itself is generated on the learner's own Pollen.
 */

window.CHORUS_STYLES = [
    { key: "shanty", label: "Sea shanty", prompt: "a rousing sea shanty, stomping beat, call-and-response chorus, sung by a rough crew" },
    { key: "lofi", label: "Lo-fi study beat", prompt: "a warm lo-fi hip-hop beat, mellow sung-spoken vocals, soft keys, vinyl crackle" },
    { key: "ballad", label: "80s power ballad", prompt: "an 80s power ballad, big reverb drums, soaring chorus, earnest vocals" },
    { key: "marching", label: "Marching band", prompt: "a marching band chant, snare and brass, shouted chorus, college fight-song energy" },
    { key: "blues", label: "Twelve-bar blues", prompt: "a twelve-bar blues shuffle, slide guitar, gravelly vocals, the facts in the verses" },
    { key: "synthwave", label: "Synthwave", prompt: "a neon synthwave track, gated drums, arpeggios, cool half-spoken vocals" },
    { key: "rap", label: "Rap", prompt: "a boom-bap hip-hop beat with a clear flow, the facts rhymed tightly in the verses" },
    { key: "folk", label: "Acoustic folk", prompt: "a close-miked acoustic folk song, fingerpicked guitar, two voices on the chorus" },
];

window.CHORUS_STARTER = {
    id: "starter-osi",
    title: "Seven Layers (The OSI Shanty)",
    style: "Sea shanty",
    subject: "the seven layers of the OSI model, bottom to top",
    starter: true,
    lyrics: [
        "Layer one is Physical — the bits upon the wire,",
        "copper, glass and radio, the only things that tire.",
        "Layer two is Data Link, it frames them in a row,",
        "MAC addresses on the tide to tell you where they go.",
        "",
        "Heave ho, the packet goes,",
        "seven layers, down and up, and every sailor knows:",
        "heave ho, the packet goes,",
        "the header tells the story and the payload never shows.",
        "",
        "Layer three is Network, the router's lonely trade,",
        "IP addresses, hop by hop, the map that it has made.",
        "Layer four is Transport, and TCP will shake your hand,",
        "UDP just throws it — and it lands where it lands.",
        "",
        "Heave ho, the packet goes,",
        "seven layers, down and up, and every sailor knows:",
        "heave ho, the packet goes,",
        "the header tells the story and the payload never shows.",
        "",
        "Layer five is Session, it holds the parley open,",
        "layer six is Presentation, encryption and encoding.",
        "Layer seven is Application — HTTP, mail and more,",
        "the one the sailor sees, the harbour and the shore.",
        "",
        "Heave ho, the packet goes,",
        "Physical, Data Link, Network, Transport, Session, Presentation, Application —",
        "that's the song, and now you know.",
    ].join("\n"),
    facts: [
        { term: "Physical", line: "Layer one is Physical — the bits upon the wire,", meaning: "layer 1: raw bits over copper, glass or radio" },
        { term: "Data Link", line: "Layer two is Data Link, it frames them in a row,", meaning: "layer 2: frames on one link, addressed by MAC" },
        { term: "Network", line: "Layer three is Network, the router's lonely trade,", meaning: "layer 3: routing between networks with IP addresses" },
        { term: "Transport", line: "Layer four is Transport, and TCP will shake your hand,", meaning: "layer 4: end-to-end delivery, TCP or UDP" },
        { term: "Session", line: "Layer five is Session, it holds the parley open,", meaning: "layer 5: keeps a conversation going between two hosts" },
        { term: "Presentation", line: "layer six is Presentation, encryption and encoding.", meaning: "layer 6: translation, encoding and encryption" },
        { term: "Application", line: "Layer seven is Application — HTTP, mail and more,", meaning: "layer 7: what the user's software actually speaks" },
    ],
};
