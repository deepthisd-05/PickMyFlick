import type { LanguageCode } from "../types";

export interface DailyMoodOption {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  genres: string[];
}

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

export const GENRE_OPTIONS: Array<{ name: string; vibe: string }> = [
  { name: "Action", vibe: "High-octane set pieces & heroics" },
  { name: "Adventure", vibe: "Journeys, quests & exploration" },
  { name: "Comedy", vibe: "Smart wit, satire & feel-good laughs" },
  { name: "Romance", vibe: "Love stories & unforgettable chemistry" },
  { name: "Thriller", vibe: "Relentless suspense & mind games" },
  { name: "Mystery", vibe: "Whodunits, clues & plot twists" },
  { name: "Horror", vibe: "Atmospheric dread & folklore chills" },
  { name: "Sci-Fi", vibe: "Cyberpunk, space epics & future ideas" },
  { name: "Drama", vibe: "Character depth & emotional resonance" },
  { name: "Fantasy", vibe: "Mythic worlds & supernatural tales" },
  { name: "Crime", vibe: "Heists, underworld & investigative grit" },
  { name: "Animation", vibe: "Handcrafted & studio animated classics" },
  { name: "Family", vibe: "Heartwarming stories for everyone" },
  { name: "Documentary", vibe: "Real-world stories & cinema verite" },
  { name: "Musical", vibe: "Showstoppers & unforgettable scores" },
  { name: "Historical", vibe: "Period epics & cultural turning points" },
  { name: "Inspirational", vibe: "Resilience, grit & human triumph" },
  { name: "Sports", vibe: "Underdog spirit & championship stakes" },
];

export const PRIORITY_MALE_ACTORS: string[] = [
  "Yash",
  "Puneeth Rajkumar",
  "Shah Rukh Khan",
  "Vijay",
  "Suriya",
  "Fahadh Faasil",
  "Allu Arjun",
  "Rakshit Shetty",
  "Rishab Shetty",
  "Aamir Khan",
  "Prabhas",
  "N. T. Rama Rao Jr.",
  "Ram Charan",
  "Mahesh Babu",
  "Nani",
  "Kamal Haasan",
  "Vijay Sethupathi",
  "Dhanush",
  "Dulquer Salmaan",
  "Mohanlal",
  "Mammootty",
  "Tovino Thomas",
  "Prithviraj Sukumaran",
  "Hrithik Roshan",
  "Ranbir Kapoor",
];

export const PRIORITY_FEMALE_ACTORS: string[] = [
  "Sai Pallavi",
  "Rashmika Mandanna",
  "Nayanthara",
  "Anushka Shetty",
  "Deepika Padukone",
  "Aishwarya Lekshmi",
  "Samantha Ruth Prabhu",
  "Trisha Krishnan",
  "Keerthy Suresh",
  "Shraddha Srinath",
  "Srinidhi Shetty",
  "Mrunal Thakur",
  "Kajol",
  "Tabu",
  "Vidya Balan",
  "Alia Bhatt",
  "Kareena Kapoor",
  "Parvathy Thiruvothu",
  "Nimisha Sajayan",
  "Aparna Balamurali",
  "Nazriya Nazim",
  "Manju Warrier",
];

export const CHARACTER_TYPE_OPTIONS: string[] = [
  "Action-oriented protagonists",
  "Romantic leads",
  "Comedy characters",
  "Strong independent protagonists",
  "Detectives and investigators",
  "Anti-heroes",
  "Family-oriented characters",
  "Emotional and dramatic roles",
];

export const STORY_TRAIT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "plot_twists", label: "Plot twists" },
  { id: "intelligent", label: "Intelligent storytelling" },
  { id: "emotional", label: "Emotional stories" },
  { id: "feel_good", label: "Feel-good movies" },
  { id: "real_life", label: "Real-life inspired films" },
];

export const TASTE_STYLE_OPTIONS: Array<{
  label: string;
  description: string;
}> = [
  {
    label: "Mind-Bending & Cerebral",
    description: "Twisty narratives, cyberpunk futures, and intelligent mysteries.",
  },
  {
    label: "Gritty Crime & Thrillers",
    description: "Sharp dialogue, anti-heroes, and taut investigative dramas.",
  },
  {
    label: "Heartfelt & Emotional",
    description: "Moving performances, deep human arcs, and memorable romances.",
  },
  {
    label: "Mass Action & Spectacle",
    description: "Larger-than-life heroes, elevation moments, and epic scale.",
  },
  {
    label: "Feel-Good & Playful",
    description: "Uplifting comedies, family stories, and effortless re-watchables.",
  },
  {
    label: "Timeless Golden Classics",
    description: "Enduring masterpieces and nostalgic cinema across decades.",
  },
];

// Mix of MovieLens 1M classics & verified regional milestones for Step 4
export const STARTER_TASTE_MOVIE_IDS: number[] = [
  2571,   // The Matrix (1999)
  318,    // The Shawshank Redemption (1994)
  100001, // K.G.F: Chapter 1 (2018)
  100003, // Kantara (2022)
  100101, // 3 Idiots (2009)
  100102, // Dangal (2016)
  100201, // RRR (2022)
  100202, // Baahubali: The Beginning (2015)
  100301, // Vikram (2022)
  100303, // Soorarai Pottru (2020)
  100401, // Drishyam (2013)
  100403, // Kumbalangi Nights (2019)
];

// All 12 requested daily moods
export const DAILY_MOODS: DailyMoodOption[] = [
  {
    key: "Feel-good",
    label: "Feel-good",
    shortLabel: "Feel-good",
    description: "Warm, uplifting crowd-pleasers and gentle humor.",
    genres: ["Comedy", "Family", "Musical"],
  },
  {
    key: "Romantic",
    label: "Romantic",
    shortLabel: "Romantic",
    description: "Love stories, soulful chemistry, and tender arcs.",
    genres: ["Romance", "Drama", "Musical"],
  },
  {
    key: "Comedy",
    label: "Comedy",
    shortLabel: "Comedy",
    description: "Lighthearted laughs, buddy capers, and sharp wit.",
    genres: ["Comedy", "Animation"],
  },
  {
    key: "Action",
    label: "Action",
    shortLabel: "Action",
    description: "High-octane momentum, stunts, and heroics.",
    genres: ["Action", "Adventure"],
  },
  {
    key: "Suspense",
    label: "Suspense",
    shortLabel: "Suspense",
    description: "Edge-of-your-seat tension and gripping mystery.",
    genres: ["Mystery", "Thriller", "Crime"],
  },
  {
    key: "Thriller",
    label: "Thriller",
    shortLabel: "Thriller",
    description: "Fast stakes, cat-and-mouse chases, and twists.",
    genres: ["Thriller", "Crime", "Action"],
  },
  {
    key: "Horror",
    label: "Horror",
    shortLabel: "Horror",
    description: "Chills, supernatural dread, and dark folklore.",
    genres: ["Horror", "Mystery", "Thriller"],
  },
  {
    key: "Emotional",
    label: "Emotional",
    shortLabel: "Emotional",
    description: "Deeply moving dramas and powerful performances.",
    genres: ["Drama", "Romance"],
  },
  {
    key: "Inspirational",
    label: "Inspirational",
    shortLabel: "Inspirational",
    description: "Triumph, real-life grit, and sports spirit.",
    genres: ["Inspirational", "Sports", "Documentary", "Drama"],
  },
  {
    key: "Family time",
    label: "Family time",
    shortLabel: "Family time",
    description: "Wholesome entertainment to enjoy together.",
    genres: ["Family", "Animation", "Children's", "Adventure"],
  },
  {
    key: "Mind-bending",
    label: "Mind-bending",
    shortLabel: "Mind-bending",
    description: "Sci-fi puzzles, non-linear stories, and plot twists.",
    genres: ["Science Fiction", "Sci-Fi", "Mystery", "Thriller"],
  },
  {
    key: "Nostalgic",
    label: "Nostalgic",
    shortLabel: "Nostalgic",
    description: "Timeless classics and golden-era cinema.",
    genres: ["Drama", "Comedy", "Musical", "Western"],
  },
];

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
