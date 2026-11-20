import {
  ChevronDown,
  Loader2,
  LogOut,
  Search,
  SlidersHorizontal,
  Smile,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { AuthUser, DailyMood, Movie, UserStats } from "../types";
import { MoviePoster } from "./MoviePoster";

export type NavPage = "home" | "rate" | "recommendations" | "insights";

interface NavbarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  user: AuthUser | null;
  userStats: UserStats | null;
  todayMood?: DailyMood | null;
  guestRatingCount?: number;
  tmdbConfigured?: boolean;
  signingOut?: boolean;
  onOpenAuth: () => void;
  onOpenEditPreferences: () => void;
  onOpenMoodPicker: () => void;
  onSignOut: () => Promise<void>;
  onSelectMovie: (movie: Movie) => void;
  onSubmitSearch: (query: string) => void;
}

const NAV_ITEMS: Array<{ id: NavPage; label: string }> = [
  { id: "home", label: "Home" },
  { id: "rate", label: "Rate Movies" },
  { id: "recommendations", label: "Recommendations" },
  { id: "insights", label: "Insights" },
];

export function Navbar({
  activePage,
  onNavigate,
  user,
  userStats,
  todayMood = null,
  guestRatingCount = 0,
  tmdbConfigured = false,
  signingOut = false,
  onOpenAuth,
  onOpenEditPreferences,
  onOpenMoodPicker,
  onSignOut,
  onSelectMovie,
  onSubmitSearch,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [quickResults, setQuickResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const menuBoxRef = useRef<HTMLDivElement | null>(null);

  const displayRatingCount = user
    ? userStats?.ratingCount ?? 0
    : guestRatingCount;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        if (!searchText.trim()) setSearchOpen(false);
        setQuickResults([]);
      }
      if (
        menuBoxRef.current &&
        !menuBoxRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [searchText]);

  useEffect(() => {
    const q = searchText.trim();
    if (!searchOpen || q.length < 2) {
      setQuickResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchMovies(q, "All", 6, 0)
        .then((res) => {
          if (!cancelled) setQuickResults(res.movies);
        })
        .catch(() => {
          if (!cancelled) setQuickResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, searchOpen]);

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) return;
    setQuickResults([]);
    onSubmitSearch(q);
  };

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 ${
        scrolled || activePage !== "home"
          ? "bg-[#141414]/95 backdrop-blur-md border-b border-white/10"
          : "bg-gradient-to-b from-[#141414]/95 via-[#141414]/75 to-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 md:gap-8 px-4 py-3 sm:px-8 lg:px-12">
        {/* Left: Brand + 4 Primary Nav Links */}
        <div className="flex items-center gap-6 lg:gap-10 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[#E50914] whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] rounded"
          >
            PICKMYFLICK
          </button>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 lg:gap-7"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded ${
                    isActive
                      ? "text-white font-semibold"
                      : "text-neutral-300 hover:text-white"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#E50914]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Expandable Search + Profile / Sign In */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Expandable Netflix-style search bar */}
          <div ref={searchBoxRef} className="relative">
            <form
              onSubmit={handleSearchFormSubmit}
              className={`flex items-center transition-all duration-200 rounded-md ${
                searchOpen
                  ? "w-48 sm:w-64 border border-white/40 bg-black/85 px-2.5 py-1.5"
                  : "border border-transparent"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (searchOpen && !searchText.trim()) {
                    setSearchOpen(false);
                  } else {
                    setSearchOpen(true);
                  }
                }}
                aria-label="Search movies"
                className="inline-flex items-center justify-center p-1 text-neutral-200 hover:text-white cursor-pointer shrink-0"
              >
                <Search className="h-4 w-4" />
              </button>

              {searchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Titles, genres..."
                    aria-label="Search MovieLens 1M catalog"
                    className="ml-2 w-full bg-transparent text-xs sm:text-sm text-white placeholder-neutral-400 focus:outline-none"
                  />
                  {searching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400 shrink-0 ml-1" />
                  ) : (
                    searchText && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchText("");
                          setQuickResults([]);
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search"
                        className="ml-1 text-neutral-400 hover:text-white cursor-pointer shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </>
              )}
            </form>

            {/* Instant Search Dropdown */}
            {searchOpen && quickResults.length > 0 && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-lg border border-white/15 bg-[#181818] shadow-2xl overflow-hidden z-50">
                <div className="divide-y divide-white/10">
                  {quickResults.map((m) => (
                    <button
                      key={m.movielens_id ?? m.title}
                      type="button"
                      onClick={() => {
                        setQuickResults([]);
                        onSelectMovie(m);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="h-11 w-8 shrink-0 rounded overflow-hidden">
                        <MoviePoster
                          posterUrl={m.poster_url}
                          title={m.title}
                          releaseYear={m.release_year}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">
                          {m.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {m.release_year ?? ""}
                          {m.genres.length > 0
                            ? ` · ${m.genres.slice(0, 2).join(", ")}`
                            : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuickResults([]);
                    onSubmitSearch(searchText.trim());
                  }}
                  className="w-full border-t border-white/10 bg-black/50 px-3 py-2 text-center text-xs font-medium text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  See all results for &ldquo;{searchText.trim()}&rdquo;
                </button>
              </div>
            )}
          </div>

          {/* Account / Profile Menu */}
          {user ? (
            <div ref={menuBoxRef} className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Open profile menu"
                className="flex items-center gap-2 rounded-md border border-white/15 bg-[#181818] px-2.5 py-1.5 text-xs sm:text-sm font-medium text-white hover:border-white/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white shrink-0 ${
                    user.is_demo ? "bg-amber-600" : "bg-[#E50914]"
                  }`}
                >
                  {user.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">
                  {user.display_name}
                </span>
                {user.is_demo && (
                  <span className="hidden md:inline rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                    Demo
                  </span>
                )}
                <span className="font-mono text-[11px] text-neutral-300 tabular-nums">
                  {displayRatingCount}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-white/15 bg-[#181818] shadow-2xl py-2 z-50">
                  <div className="px-3.5 py-2 border-b border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-white truncate">
                        {user.display_name}
                      </p>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${
                          user.is_demo
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-emerald-500/15 text-emerald-200"
                        }`}
                      >
                        {user.is_demo ? "Demo Sandbox" : "Personal"}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      @{user.username} · {displayRatingCount} rated
                    </p>
                    {todayMood && (
                      <p className="mt-1 text-[11px] text-neutral-300 truncate">
                        Today&apos;s Mood:{" "}
                        <span className="text-white font-medium">
                          {todayMood.moodLabel}
                        </span>
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {tmdbConfigured ? "TMDB API Active" : "Built-in ML-1M Metadata"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAuth();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-neutral-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    Profile, My List &amp; History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenEditPreferences();
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-xs text-neutral-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#E50914]" />
                    <span>Edit Preferences</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenMoodPicker();
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-xs text-neutral-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <Smile className="h-3.5 w-3.5 text-[#E50914]" />
                    <span>Change Today&apos;s Mood</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void onSignOut();
                    }}
                    disabled={signingOut}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-rose-300 hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer border-t border-white/10 mt-1 pt-2"
                  >
                    {signingOut ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void onSignOut()}
                disabled={signingOut}
                title="Sign Out"
                aria-label="Sign Out"
                className="hidden lg:inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:border-white/35 hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {signingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-2 rounded-md bg-[#E50914] hover:bg-[#F40612] px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <User className="h-4 w-4" />
              <span>Sign In</span>
              {guestRatingCount > 0 && (
                <span className="font-mono text-[11px] opacity-90 tabular-nums">
                  ({guestRatingCount})
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Always-visible 4-link navigation strip on mobile viewports */}
      <nav
        aria-label="Mobile Primary Navigation"
        className="md:hidden border-t border-white/10 bg-[#141414] px-3 py-2 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#E50914] text-white"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
