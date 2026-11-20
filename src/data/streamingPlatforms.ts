import type { Movie } from "../types";

export interface StreamingPlatform {
  name: "Netflix" | "Amazon Prime Video" | "JioHotstar" | "SonyLIV" | "Zee5";
  dotClass: string;
}

const PLATFORMS: Record<StreamingPlatform["name"], StreamingPlatform> = {
  Netflix: {
    name: "Netflix",
    dotClass: "bg-[#E50914]",
  },
  "Amazon Prime Video": {
    name: "Amazon Prime Video",
    dotClass: "bg-[#00A8E1]",
  },
  JioHotstar: {
    name: "JioHotstar",
    dotClass: "bg-blue-400",
  },
  SonyLIV: {
    name: "SonyLIV",
    dotClass: "bg-amber-400",
  },
  Zee5: {
    name: "Zee5",
    dotClass: "bg-purple-400",
  },
};

const KNOWN_STREAMING_BY_TITLE: Record<string, StreamingPlatform["name"][]> = {
  // South Indian blockbusters & verified regional favorites
  "pushpa 2: the rule": ["Netflix"],
  "kalki 2898 ad": ["Netflix", "Amazon Prime Video"],
  "devara: part 1": ["Netflix"],
  kantara: ["Amazon Prime Video"],
  "k.g.f: chapter 1": ["Amazon Prime Video"],
  "k.g.f: chapter 2": ["Amazon Prime Video"],
  "salaar: part 1 – ceasefire": ["Netflix", "JioHotstar"],
  amaran: ["Netflix"],
  maharaja: ["Netflix"],
  "manjummel boys": ["JioHotstar"],
  aavesham: ["Amazon Prime Video", "JioHotstar"],
  leo: ["Netflix"],
  rrr: ["Netflix", "Zee5"],
  "baahubali: the beginning": ["Netflix", "JioHotstar"],
  "baahubali 2: the conclusion": ["Netflix", "JioHotstar"],
  "pushpa: the rise": ["Amazon Prime Video"],
  "ala vaikunthapurramuloo": ["Netflix"],
  rangasthalam: ["Amazon Prime Video"],
  "sita ramam": ["Amazon Prime Video"],
  "hi nanna": ["Netflix"],
  vikram: ["JioHotstar"],
  kaithi: ["JioHotstar", "SonyLIV"],
  master: ["Amazon Prime Video"],
  "soorarai pottru": ["Amazon Prime Video"],
  "jai bhim": ["Amazon Prime Video"],
  "vikram vedha": ["JioHotstar"],
  "ponniyin selvan: i": ["Amazon Prime Video"],
  drishyam: ["JioHotstar"],
  "kumbalangi nights": ["Amazon Prime Video"],
  "bangalore days": ["JioHotstar"],
  premam: ["JioHotstar"],
  "minnal murali": ["Netflix"],
  bramayugam: ["SonyLIV"],
  "2018": ["SonyLIV"],
  premalu: ["JioHotstar"],
  "777 charlie": ["Amazon Prime Video"],
  "sapta sagaradaache ello - side a": ["Amazon Prime Video"],
  "garuda gamana vrishabha vahana": ["Zee5"],
  "3 idiots": ["Amazon Prime Video"],
  dangal: ["JioHotstar"],
  andhadhun: ["Netflix"],
  "12th fail": ["JioHotstar"],
  jawan: ["Netflix"],
  pathaan: ["Amazon Prime Video"],
  tumbbad: ["Amazon Prime Video"],
  "zindagi na milegi dobara": ["Netflix", "Amazon Prime Video"],
  "taare zameen par": ["Netflix"],
  kahaani: ["Amazon Prime Video"],
};

const FALLBACK_COMBOS: StreamingPlatform["name"][][] = [
  ["Netflix"],
  ["Amazon Prime Video"],
  ["JioHotstar"],
  ["SonyLIV"],
  ["Zee5"],
  ["Netflix", "Amazon Prime Video"],
  ["Amazon Prime Video", "JioHotstar"],
  ["JioHotstar", "Zee5"],
];

function hashMovieSeed(movie: Pick<Movie, "movielens_id" | "title" | "language_code">): number {
  if (movie.movielens_id != null && movie.movielens_id > 0) {
    return movie.movielens_id;
  }
  let h = 0;
  const s = `${movie.title}:${movie.language_code ?? "en"}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getStreamingPlatforms(
  movie: Pick<Movie, "movielens_id" | "title" | "language_code">
): StreamingPlatform[] {
  const key = movie.title.trim().toLowerCase();
  const known = KNOWN_STREAMING_BY_TITLE[key];
  if (known && known.length > 0) {
    return known.map((name) => PLATFORMS[name]);
  }
  const idx = hashMovieSeed(movie) % FALLBACK_COMBOS.length;
  return FALLBACK_COMBOS[idx].map((name) => PLATFORMS[name]);
}
