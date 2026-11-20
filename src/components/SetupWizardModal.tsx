import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Globe,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CHARACTER_TYPE_OPTIONS,
  GENRE_OPTIONS,
  LANGUAGE_OPTIONS,
  PRIORITY_FEMALE_ACTORS,
  PRIORITY_MALE_ACTORS,
  STARTER_TASTE_MOVIE_IDS,
  STORY_TRAIT_OPTIONS,
  TASTE_STYLE_OPTIONS,
} from "../data/preferencesData";
import { api, type SavePreferencesPayload } from "../services/api";
import type { LanguagePreferenceMode, Movie, UserPreferences } from "../types";
import { MoviePoster } from "./MoviePoster";

interface SetupWizardModalProps {
  open: boolean;
  mode: "onboarding" | "edit";
  userDisplayName: string;
  initialPreferences: UserPreferences | null;
  onClose: () => void;
  onSavePreferences: (payload: SavePreferencesPayload) => Promise<void>;
}

const STEP_META = [
  {
    step: 1 as const,
    title: "Language",
    icon: Globe,
    subtitle:
      "Select original languages, dubbed languages, and your preferred audio mode.",
  },
  {
    step: 2 as const,
    title: "Genres",
    icon: Film,
    subtitle: "Pick all genres that fit your taste across regional and global cinema.",
  },
  {
    step: 3 as const,
    title: "Favourite Actors",
    icon: Users,
    subtitle:
      "Choose favourite Heroes / Male Actors, Heroines / Female Actors, and character types.",
  },
  {
    step: 4 as const,
    title: "Your Movie Taste",
    icon: Sparkles,
    subtitle:
      "Fine-tune story pacing, runtime, era, story traits, and optional starter titles.",
  },
];

export function SetupWizardModal({
  open,
  mode,
  userDisplayName,
  initialPreferences,
  onClose,
  onSavePreferences,
}: SetupWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // Step 1
  const [originalLanguages, setOriginalLanguages] = useState<string[]>(["en"]);
  const [dubbedLanguages, setDubbedLanguages] = useState<string[]>([]);
  const [languageMode, setLanguageMode] = useState<LanguagePreferenceMode>("both");
  // Step 2
  const [genres, setGenres] = useState<string[]>([]);
  // Step 3
  const [maleActors, setMaleActors] = useState<string[]>([]);
  const [femaleActors, setFemaleActors] = useState<string[]>([]);
  const [characterTypes, setCharacterTypes] = useState<string[]>([]);
  const [actorSearch, setActorSearch] = useState("");
  const [customActor, setCustomActor] = useState("");
  const [customActorGroup, setCustomActorGroup] = useState<"male" | "female">("male");
  const [actorDirectory, setActorDirectory] = useState<{
    maleActors: string[];
    femaleActors: string[];
  }>({
    maleActors: PRIORITY_MALE_ACTORS,
    femaleActors: PRIORITY_FEMALE_ACTORS,
  });
  // Step 4
  const [tasteStyle, setTasteStyle] = useState<string | null>(null);
  const [storyStyles, setStoryStyles] = useState<string[]>([]);
  const [pacingPreference, setPacingPreference] = useState<
    "fast_paced" | "slow_burn" | "balanced"
  >("balanced");
  const [runtimePreference, setRuntimePreference] = useState<
    "short" | "standard" | "long" | "any"
  >("any");
  const [eraPreference, setEraPreference] = useState<"classic" | "recent" | "any">(
    "any"
  );
  const [tasteMovieIds, setTasteMovieIds] = useState<number[]>([]);

  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [starterMovies, setStarterMovies] = useState<Movie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    const orig =
      initialPreferences?.originalLanguages?.length
        ? initialPreferences.originalLanguages
        : initialPreferences?.preferredLanguages?.length
        ? initialPreferences.preferredLanguages
        : ["en"];
    setOriginalLanguages(orig);
    setDubbedLanguages(initialPreferences?.dubbedLanguages ?? []);
    setLanguageMode(initialPreferences?.languageMode ?? "both");
    setGenres(
      initialPreferences?.favoriteGenres?.length
        ? initialPreferences.favoriteGenres
        : initialPreferences?.preferredGenres ?? []
    );
    setMaleActors(initialPreferences?.favoriteMaleActors ?? []);
    setFemaleActors(initialPreferences?.favoriteFemaleActors ?? []);
    setCharacterTypes(initialPreferences?.characterTypes ?? []);
    setTasteStyle(initialPreferences?.tasteStyle ?? null);
    setStoryStyles(initialPreferences?.storyStyles ?? []);
    setPacingPreference(initialPreferences?.pacingPreference ?? "balanced");
    setRuntimePreference(initialPreferences?.runtimePreference ?? "any");
    setEraPreference(initialPreferences?.eraPreference ?? "any");
    setTasteMovieIds(initialPreferences?.tasteMovieIds ?? []);
    setSkippedSteps(initialPreferences?.skippedSteps ?? []);
    setActorSearch("");
    setCustomActor("");
    setError(null);
  }, [open, initialPreferences]);

  useEffect(() => {
    if (!open) return;
    api
      .getActorsCatalog()
      .then((res) => setActorDirectory(res))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || starterMovies.length > 0) return;
    let cancelled = false;
    setLoadingMovies(true);
    api
      .lookupMovies(STARTER_TASTE_MOVIE_IDS)
      .then((res) => {
        if (!cancelled) setStarterMovies(res.movies);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingMovies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, starterMovies.length]);

  const filteredMaleActors = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    const list = Array.from(
      new Set([...PRIORITY_MALE_ACTORS, ...actorDirectory.maleActors, ...maleActors])
    );
    return q ? list.filter((a) => a.toLowerCase().includes(q)) : list;
  }, [actorSearch, actorDirectory.maleActors, maleActors]);

  const filteredFemaleActors = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    const list = Array.from(
      new Set([...PRIORITY_FEMALE_ACTORS, ...actorDirectory.femaleActors, ...femaleActors])
    );
    return q ? list.filter((a) => a.toLowerCase().includes(q)) : list;
  }, [actorSearch, actorDirectory.femaleActors, femaleActors]);

  if (!open) return null;

  const toggleString = (
    list: string[],
    value: string,
    setter: (next: string[]) => void
  ) => {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const toggleMovieId = (id: number) => {
    setTasteMovieIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddCustomActor = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customActor.trim();
    if (!trimmed) return;
    if (customActorGroup === "male") {
      if (!maleActors.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
        setMaleActors((prev) => [...prev, trimmed]);
      }
    } else {
      if (!femaleActors.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
        setFemaleActors((prev) => [...prev, trimmed]);
      }
    }
    setCustomActor("");
  };

  const buildPayload = (
    nextSkipped: number[],
    includeStarterRatings = false
  ): SavePreferencesPayload => {
    const mergedLangs = Array.from(
      new Set([...originalLanguages, ...dubbedLanguages])
    );
    const mergedActors = Array.from(new Set([...maleActors, ...femaleActors]));
    return {
      preferredLanguages: mergedLangs.length > 0 ? mergedLangs : ["en"],
      originalLanguages,
      dubbedLanguages,
      languageMode,
      preferredGenres: genres,
      favoriteGenres: genres,
      favoriteActors: mergedActors,
      favoriteMaleActors: maleActors,
      favoriteFemaleActors: femaleActors,
      characterTypes,
      tasteStyle,
      storyStyles,
      pacingPreference,
      runtimePreference,
      eraPreference,
      tasteMovieIds,
      setupCompleted: true,
      skippedSteps: nextSkipped,
      starterRatings:
        includeStarterRatings && tasteMovieIds.length > 0
          ? tasteMovieIds.map((movielensId) => ({ movielensId, rating: 5 }))
          : undefined,
    };
  };

  const handleSkipStep = () => {
    setSkippedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    if (step < 4) {
      setStep((step + 1) as 1 | 2 | 3 | 4);
    } else {
      void handleFinish(true);
    }
  };

  const handleSkipAll = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSavePreferences(
        buildPayload(Array.from(new Set([...skippedSteps, step])), false)
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setup state.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async (skippedCurrent = false) => {
    setSaving(true);
    setError(null);
    const nextSkipped = skippedCurrent
      ? Array.from(new Set([...skippedSteps, 4]))
      : skippedSteps.filter((s) => s !== 4);
    try {
      await onSavePreferences(buildPayload(nextSkipped, true));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const currentMeta = STEP_META[step - 1];
  const StepIcon = currentMeta.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Personalize Your PICKMYFLICK Preferences"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (mode === "edit") onClose();
          else void handleSkipAll();
        }
      }}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl border border-white/15 bg-[#181818] p-5 sm:p-7 shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (mode === "edit") onClose();
            else void handleSkipAll();
          }}
          disabled={saving}
          aria-label="Close setup wizard"
          className="absolute right-4 top-4 z-20 inline-flex items-center justify-center rounded-full border border-white/20 bg-black/70 p-1.5 text-neutral-200 hover:bg-black hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Top Header + Step Progress */}
        <div className="pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#E50914]">
              {mode === "onboarding"
                ? `Welcome, ${userDisplayName} · Step ${step} of 4 — ${currentMeta.title}`
                : `Edit Preferences · Step ${step} of 4 — ${currentMeta.title}`}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => (mode === "edit" ? onClose() : void handleSkipAll())}
              className="text-xs font-medium text-neutral-400 hover:text-white cursor-pointer"
            >
              {mode === "onboarding" ? "Skip setup for now" : "Cancel"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {STEP_META.map((item) => {
              const active = item.step === step;
              const passed = item.step < step;
              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={saving}
                  onClick={() => setStep(item.step)}
                  className="group text-left cursor-pointer"
                >
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      active
                        ? "bg-[#E50914]"
                        : passed
                        ? "bg-white"
                        : "bg-white/15 group-hover:bg-white/30"
                    }`}
                  />
                  <span
                    className={`mt-1.5 block text-[11px] truncate ${
                      active ? "text-white font-semibold" : "text-neutral-400"
                    }`}
                  >
                    {item.step}. {item.title}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-3">
            <div className="rounded-lg border border-white/15 bg-[#141414] p-2.5 text-[#E50914] shrink-0">
              <StepIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Step {step} of 4 — {currentMeta.title}
              </h2>
              <p className="mt-0.5 text-sm text-neutral-400">
                {currentMeta.subtitle}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200"
          >
            {error}
          </div>
        )}

        {/* Step Body */}
        <div className="mt-5 min-h-[280px] max-h-[58vh] overflow-y-auto pr-1 space-y-5">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Original Audio Languages
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const selected = originalLanguages.includes(lang.code);
                    return (
                      <button
                        key={`orig-${lang.code}`}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 1));
                          toggleString(
                            originalLanguages,
                            lang.code,
                            setOriginalLanguages
                          );
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {lang.name} ({lang.code})
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {lang.nativeName}
                          </p>
                        </div>
                        {selected && (
                          <Check className="h-4 w-4 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Dubbed Audio Languages (Optional)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const selected = dubbedLanguages.includes(lang.code);
                    return (
                      <button
                        key={`dub-${lang.code}`}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 1));
                          toggleString(dubbedLanguages, lang.code, setDubbedLanguages);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        <span className="truncate">
                          {lang.name} Dub ({lang.code})
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Playback Preference Mode
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: "original",
                        label: "Original Audio",
                        desc: "Prioritize native-language releases",
                      },
                      {
                        id: "dubbed",
                        label: "Dubbed Versions",
                        desc: "Prioritize dubbed availability",
                      },
                      {
                        id: "both",
                        label: "Both Original & Dubbed",
                        desc: "Blend native & dubbed titles",
                      },
                    ] as const
                  ).map((m) => {
                    const active = languageMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 1));
                          setLanguageMode(m.id);
                        }}
                        className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                          active
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        <p className="text-xs font-semibold">{m.label}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {m.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {GENRE_OPTIONS.map((g) => {
                const selected = genres.includes(g.name);
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => {
                      setSkippedSteps((p) => p.filter((s) => s !== 2));
                      toggleString(genres, g.name, setGenres);
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                      selected
                        ? "border-[#E50914] bg-[#E50914]/15 text-white"
                        : "border-white/10 bg-[#141414] text-neutral-200 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{g.name}</span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-400 line-clamp-2">
                      {g.vibe}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="search"
                    value={actorSearch}
                    onChange={(e) => setActorSearch(e.target.value)}
                    placeholder="Search heroes & heroines (e.g., Yash, Sai Pallavi)..."
                    className="w-full rounded-md border border-white/15 bg-[#141414] pl-8 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
                  />
                </div>

                <form onSubmit={handleAddCustomActor} className="flex gap-1.5">
                  <select
                    value={customActorGroup}
                    onChange={(e) =>
                      setCustomActorGroup(e.target.value as "male" | "female")
                    }
                    aria-label="Actor category"
                    className="rounded-md border border-white/15 bg-[#141414] px-2 py-2 text-xs text-neutral-200 focus:outline-none"
                  >
                    <option value="male">Hero</option>
                    <option value="female">Heroine</option>
                  </select>
                  <input
                    type="text"
                    value={customActor}
                    onChange={(e) => setCustomActor(e.target.value)}
                    placeholder="Add custom actor..."
                    className="flex-1 min-w-0 rounded-md border border-white/15 bg-[#141414] px-2.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!customActor.trim()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 hover:bg-white/20 disabled:opacity-40 px-2.5 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </form>
              </div>

              {(maleActors.length > 0 || femaleActors.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {maleActors.map((a) => (
                    <button
                      key={`sel-m-${a}`}
                      type="button"
                      onClick={() => toggleString(maleActors, a, setMaleActors)}
                      className="inline-flex items-center gap-1 rounded border border-[#E50914] bg-[#E50914]/20 px-2 py-0.5 text-[11px] text-white cursor-pointer"
                    >
                      <span>{a}</span>
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  {femaleActors.map((a) => (
                    <button
                      key={`sel-f-${a}`}
                      type="button"
                      onClick={() => toggleString(femaleActors, a, setFemaleActors)}
                      className="inline-flex items-center gap-1 rounded border border-[#E50914] bg-[#E50914]/20 px-2 py-0.5 text-[11px] text-white cursor-pointer"
                    >
                      <span>{a}</span>
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Favourite Heroes / Male Actors ({maleActors.length} selected)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {filteredMaleActors.slice(0, 45).map((actor) => {
                    const selected = maleActors.includes(actor);
                    return (
                      <button
                        key={`m-${actor}`}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 3));
                          toggleString(maleActors, actor, setMaleActors);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{actor}</span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Favourite Heroines / Female Actors ({femaleActors.length} selected)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {filteredFemaleActors.slice(0, 45).map((actor) => {
                    const selected = femaleActors.includes(actor);
                    return (
                      <button
                        key={`f-${actor}`}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 3));
                          toggleString(femaleActors, actor, setFemaleActors);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{actor}</span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Preferred Character Types
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CHARACTER_TYPE_OPTIONS.map((ct) => {
                    const selected = characterTypes.includes(ct);
                    return (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 3));
                          toggleString(characterTypes, ct, setCharacterTypes);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        <span className="truncate">{ct}</span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Story &amp; Tone Traits
                </p>
                <div className="flex flex-wrap gap-2">
                  {STORY_TRAIT_OPTIONS.map((trait) => {
                    const selected = storyStyles.includes(trait.id);
                    return (
                      <button
                        key={trait.id}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 4));
                          toggleString(storyStyles, trait.id, setStoryStyles);
                        }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914] text-white"
                            : "border-white/15 bg-[#141414] text-neutral-300 hover:border-white/35"
                        }`}
                      >
                        {trait.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-semibold text-neutral-300 mb-1.5">
                    Pacing
                  </p>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: "fast_paced", label: "Fast-paced" },
                        { id: "slow_burn", label: "Slow-burn" },
                        { id: "balanced", label: "Balanced / Either" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPacingPreference(p.id)}
                        className={`w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          pacingPreference === p.id
                            ? "border-[#E50914] bg-[#E50914]/15 text-white font-semibold"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-300 mb-1.5">
                    Runtime
                  </p>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: "short", label: "Crisp (< 125 min)" },
                        { id: "standard", label: "Standard (125–155m)" },
                        { id: "long", label: "Epic (155+ min)" },
                        { id: "any", label: "Any length" },
                      ] as const
                    ).map((rt) => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => setRuntimePreference(rt.id)}
                        className={`w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          runtimePreference === rt.id
                            ? "border-[#E50914] bg-[#E50914]/15 text-white font-semibold"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        {rt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-300 mb-1.5">
                    Release Era
                  </p>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: "classic", label: "Older classics" },
                        { id: "recent", label: "Recent releases" },
                        { id: "any", label: "All eras" },
                      ] as const
                    ).map((er) => (
                      <button
                        key={er.id}
                        type="button"
                        onClick={() => setEraPreference(er.id)}
                        className={`w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          eraPreference === er.id
                            ? "border-[#E50914] bg-[#E50914]/15 text-white font-semibold"
                            : "border-white/10 bg-[#141414] text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        {er.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-300 mb-2">
                  Signature Viewing Vibe
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TASTE_STYLE_OPTIONS.map((opt) => {
                    const selected = tasteStyle === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setSkippedSteps((p) => p.filter((s) => s !== 4));
                          setTasteStyle(selected ? null : opt.label);
                        }}
                        className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? "border-[#E50914] bg-[#E50914]/15 text-white"
                            : "border-white/10 bg-[#141414] text-neutral-200 hover:border-white/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{opt.label}</span>
                          {selected && (
                            <Check className="h-3.5 w-3.5 text-[#E50914] shrink-0" />
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-neutral-300">
                    Optional: Pick Movies You Love (seeds your rating vector)
                  </p>
                  <span className="font-mono text-[11px] text-neutral-400">
                    {tasteMovieIds.length} selected
                  </span>
                </div>
                {loadingMovies ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-neutral-400">
                    <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />
                    <span>Loading catalog titles...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {starterMovies.map((m) => {
                      const id = m.movielens_id!;
                      const selected = tasteMovieIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setSkippedSteps((p) => p.filter((s) => s !== 4));
                            toggleMovieId(id);
                          }}
                          className={`group relative rounded-lg border overflow-hidden text-left transition-all cursor-pointer ${
                            selected
                              ? "border-[#E50914] ring-1 ring-[#E50914]"
                              : "border-white/10 hover:border-white/30"
                          }`}
                        >
                          <div className="aspect-[2/3] w-full">
                            <MoviePoster
                              posterUrl={m.poster_url}
                              title={m.title}
                              originalTitle={m.original_title}
                              languageCode={m.language_code}
                              releaseYear={m.release_year}
                              genres={m.genres}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="bg-[#141414] px-2 py-1.5">
                            <p className="text-[11px] font-medium text-white truncate">
                              {m.title}
                            </p>
                            <p className="text-[10px] text-neutral-400">
                              {m.release_year}
                            </p>
                          </div>
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E50914] text-white shadow">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#141414] px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-white/10 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            ) : (
              <span className="text-[11px] text-neutral-500">
                You can update these anytime from Profile → Edit Preferences
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={handleSkipStep}
              className="rounded-md border border-white/15 bg-transparent hover:bg-white/10 px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer"
            >
              Skip
            </button>

            {step < 4 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E50914] hover:bg-[#F40612] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleFinish(false)}
                className="inline-flex items-center gap-2 rounded-md bg-[#E50914] hover:bg-[#F40612] disabled:opacity-50 px-5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{saving ? "Saving..." : "Finish Setup"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
