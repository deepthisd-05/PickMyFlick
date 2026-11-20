import type { LanguageCode, UserPreferences } from "../types";

export interface PresetRatingItem {
  movielensId: number;
  title: string;
  year: number;
  rating: number;
  moodTag?: string;
  note?: string;
}

export interface StarterPack {
  id: string;
  name: string;
  subtitle: string;
  items: PresetRatingItem[];
}

export interface TasteProfilePreset {
  id: string;
  name: string;
  summary: string;
  items: PresetRatingItem[];
}

export const MOOD_TAGS = [
  "great plot twist",
  "re-watchable",
  "mind-bending",
  "visually stunning",
  "slow pacing",
  "emotional",
] as const;

export const LANGUAGE_OPTIONS: Array<{
  code: LanguageCode;
  name: string;
  nativeName: string;
}> = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
];

export const LANGUAGE_NAME_BY_CODE: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
};

export const WIZARD_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Romance",
  "Thriller",
  "Mystery",
  "Horror",
  "Sci-Fi",
  "Drama",
  "Fantasy",
  "Crime",
  "Animation",
  "Family",
  "Documentary",
  "Musical",
  "Historical",
  "Inspirational",
  "Sports",
] as const;

export const CHARACTER_TYPES = [
  "Action-oriented protagonists",
  "Romantic leads",
  "Comedy characters",
  "Strong independent protagonists",
  "Detectives and investigators",
  "Anti-heroes",
  "Family-oriented characters",
  "Emotional and dramatic roles",
] as const;

export const STORY_STYLE_TRAITS = [
  { id: "plot_twists", label: "Plot twists" },
  { id: "intelligent", label: "Intelligent storytelling" },
  { id: "emotional", label: "Emotional stories" },
  { id: "feel_good", label: "Feel-good movies" },
  { id: "real_life", label: "Real-life inspired films" },
] as const;

export const DEFAULT_PREFERENCES_CLIENT: UserPreferences = {
  preferredLanguages: ["en"],
  originalLanguages: ["en"],
  dubbedLanguages: [],
  languageMode: "both",
  preferredGenres: [],
  favoriteGenres: [],
  favoriteActors: [],
  favoriteMaleActors: [],
  favoriteFemaleActors: [],
  characterTypes: [],
  tasteStyle: null,
  tasteMovieIds: [],
  storyStyles: [],
  pacingPreference: "balanced",
  runtimePreference: "any",
  eraPreference: "any",
  setupCompleted: false,
  skippedSteps: [],
};

export const STARTER_PACKS: StarterPack[] = [
  {
    id: "scifi_classics",
    name: "Sci-Fi Classics",
    subtitle: "6 landmark cyberpunk, space & sci-fi essentials",
    items: [
      { movielensId: 2571, title: "The Matrix", year: 1999, rating: 5, moodTag: "mind-bending" },
      { movielensId: 541, title: "Blade Runner", year: 1982, rating: 5, moodTag: "visually stunning" },
      { movielensId: 589, title: "Terminator 2: Judgment Day", year: 1991, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1214, title: "Alien", year: 1979, rating: 5, moodTag: "visually stunning" },
      { movielensId: 260, title: "Star Wars: Episode IV", year: 1977, rating: 5, moodTag: "re-watchable" },
      { movielensId: 924, title: "2001: A Space Odyssey", year: 1968, rating: 4, moodTag: "slow pacing" },
    ],
  },
  {
    id: "nineties_thrillers",
    name: "90s Thrillers",
    subtitle: "5 razor-sharp neo-noir & psychological mysteries",
    items: [
      { movielensId: 47, title: "Se7en", year: 1995, rating: 5, moodTag: "great plot twist" },
      { movielensId: 593, title: "The Silence of the Lambs", year: 1991, rating: 5, moodTag: "great plot twist" },
      { movielensId: 50, title: "The Usual Suspects", year: 1995, rating: 5, moodTag: "great plot twist" },
      { movielensId: 1617, title: "L.A. Confidential", year: 1997, rating: 5, moodTag: "re-watchable" },
      { movielensId: 608, title: "Fargo", year: 1996, rating: 4, moodTag: "re-watchable" },
    ],
  },
  {
    id: "feelgood_comedies",
    name: "Feel-Good Comedies",
    subtitle: "6 witty crowd-pleasers & timeless light classics",
    items: [
      { movielensId: 1, title: "Toy Story", year: 1995, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1265, title: "Groundhog Day", year: 1993, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1197, title: "The Princess Bride", year: 1987, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1270, title: "Back to the Future", year: 1985, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1307, title: "When Harry Met Sally...", year: 1989, rating: 4, moodTag: "emotional" },
      { movielensId: 39, title: "Clueless", year: 1995, rating: 4, moodTag: "re-watchable" },
    ],
  },
  {
    id: "award_winners",
    name: "Award Winners",
    subtitle: "6 prestige dramas & Academy Award favorites",
    items: [
      { movielensId: 318, title: "The Shawshank Redemption", year: 1994, rating: 5, moodTag: "emotional" },
      { movielensId: 527, title: "Schindler's List", year: 1993, rating: 5, moodTag: "emotional" },
      { movielensId: 858, title: "The Godfather", year: 1972, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1213, title: "GoodFellas", year: 1990, rating: 5, moodTag: "re-watchable" },
      { movielensId: 2858, title: "American Beauty", year: 1999, rating: 5, moodTag: "great plot twist" },
      { movielensId: 296, title: "Pulp Fiction", year: 1994, rating: 4, moodTag: "mind-bending" },
    ],
  },
];

export const SAMPLE_TASTE_PROFILES: TasteProfilePreset[] = [
  {
    id: "scifi_cyberpunk",
    name: "Sci-Fi & Cyberpunk Fan",
    summary: "High ratings on futuristic dystopias, cyberpunk & space epics",
    items: [
      { movielensId: 2571, title: "The Matrix", year: 1999, rating: 5, moodTag: "mind-bending", note: "Iconic cyberpunk worldbuilding" },
      { movielensId: 541, title: "Blade Runner", year: 1982, rating: 5, moodTag: "visually stunning", note: "Atmospheric noir cinematography" },
      { movielensId: 1214, title: "Alien", year: 1979, rating: 5, moodTag: "visually stunning" },
      { movielensId: 589, title: "Terminator 2: Judgment Day", year: 1991, rating: 5, moodTag: "re-watchable" },
      { movielensId: 924, title: "2001: A Space Odyssey", year: 1968, rating: 4, moodTag: "slow pacing" },
      { movielensId: 260, title: "Star Wars: Episode IV", year: 1977, rating: 4, moodTag: "re-watchable" },
    ],
  },
  {
    id: "noir_crime",
    name: "Neo-Noir & Crime Buff",
    summary: "Focused on dark mysteries, crime sagas & twist-driven thrillers",
    items: [
      { movielensId: 47, title: "Se7en", year: 1995, rating: 5, moodTag: "great plot twist", note: "Unforgettable finale" },
      { movielensId: 50, title: "The Usual Suspects", year: 1995, rating: 5, moodTag: "great plot twist", note: "Masterclass in misdirection" },
      { movielensId: 593, title: "The Silence of the Lambs", year: 1991, rating: 5, moodTag: "great plot twist" },
      { movielensId: 1617, title: "L.A. Confidential", year: 1997, rating: 5, moodTag: "re-watchable" },
      { movielensId: 858, title: "The Godfather", year: 1972, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1213, title: "GoodFellas", year: 1990, rating: 5, moodTag: "re-watchable" },
    ],
  },
  {
    id: "comedy_feelgood",
    name: "Classic Comedy & Feel-Good",
    summary: "Warm comedies, clever high-concept adventures & animation",
    items: [
      { movielensId: 1265, title: "Groundhog Day", year: 1993, rating: 5, moodTag: "re-watchable", note: "Endless comedic invention" },
      { movielensId: 1197, title: "The Princess Bride", year: 1987, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1, title: "Toy Story", year: 1995, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1270, title: "Back to the Future", year: 1985, rating: 5, moodTag: "re-watchable" },
      { movielensId: 1307, title: "When Harry Met Sally...", year: 1989, rating: 5, moodTag: "emotional" },
      { movielensId: 39, title: "Clueless", year: 1995, rating: 4, moodTag: "re-watchable" },
    ],
  },
  {
    id: "prestige_drama",
    name: "Prestige Drama Critic",
    summary: "Character-driven Oscar winners and acclaimed dramatic narratives",
    items: [
      { movielensId: 318, title: "The Shawshank Redemption", year: 1994, rating: 5, moodTag: "emotional", note: "Hopeful and deeply earned" },
      { movielensId: 527, title: "Schindler's List", year: 1993, rating: 5, moodTag: "emotional" },
      { movielensId: 2858, title: "American Beauty", year: 1999, rating: 5, moodTag: "great plot twist" },
      { movielensId: 858, title: "The Godfather", year: 1972, rating: 5, moodTag: "re-watchable" },
      { movielensId: 356, title: "Forrest Gump", year: 1994, rating: 4, moodTag: "emotional" },
      { movielensId: 608, title: "Fargo", year: 1996, rating: 4, moodTag: "re-watchable" },
    ],
  },
];
