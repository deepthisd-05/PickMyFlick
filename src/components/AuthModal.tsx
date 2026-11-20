import {
  Bookmark,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Loader2,
  LogOut,
  MessageSquareQuote,
  SlidersHorizontal,
  Smile,
  Star,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGE_NAME_BY_CODE } from "../data/presets";
import { api } from "../services/api";
import type {
  AuthUser,
  DailyMood,
  Movie,
  UserPreferences,
  UserRating,
  UserStats,
} from "../types";
import { MoviePoster } from "./MoviePoster";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
  userStats: UserStats | null;
  preferences?: UserPreferences | null;
  todayMood?: DailyMood | null;
  userRatings?: UserRating[];
  guestRatingCount?: number;
  watchlist: Movie[];
  onAuthSuccess: (opts?: { justRegistered?: boolean }) => Promise<void>;
  onSignOut: () => Promise<void>;
  onRemoveWatchlist: (movielensId: number) => Promise<void>;
  onSelectMovie: (movie: Movie) => void;
  onOpenEditPreferences: () => void;
  onOpenMoodPicker: () => void;
  fullScreenGate?: boolean;
}

type FieldErrors = {
  emailOrUsername?: string;
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const DEFAULT_AVATAR = "/src/assets/images/user_avatar_cinephile_1795156650838.jpg";

export function AuthModal({
  open,
  onClose,
  user,
  userStats,
  preferences = null,
  todayMood = null,
  userRatings = [],
  guestRatingCount = 0,
  watchlist,
  onAuthSuccess,
  onSignOut,
  onRemoveWatchlist,
  onSelectMovie,
  onOpenEditPreferences,
  onOpenMoodPicker,
  fullScreenGate = false,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [profileTab, setProfileTab] = useState<"watchlist" | "history" | "preferences">("watchlist");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [editName, setEditName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    null | "login" | "register" | "logout" | "profile"
  >(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      setProfileMessage(null);
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  useEffect(() => {
    if (!user) {
      setEditName("");
      setProfileMessage(null);
      setProfileTab("watchlist");
    }
  }, [user]);

  if (!open) return null;

  const isBusy = busyAction !== null;

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setFieldErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nextErrors: FieldErrors = {};
    if (!emailOrUsername.trim()) {
      nextErrors.emailOrUsername = "Enter your email address or username.";
    }
    if (!password) {
      nextErrors.password = "Enter your password.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setBusyAction("login");
    try {
      await api.login({
        emailOrUsername: emailOrUsername.trim(),
        password,
      });
      setPassword("");
      setConfirmPassword("");
      onClose();
      await onAuthSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nextErrors: FieldErrors = {};
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (cleanName.length < 2) {
      nextErrors.fullName = "Enter your full name (at least 2 characters).";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setBusyAction("register");
    try {
      await api.register({
        fullName: cleanName,
        email: cleanEmail,
        password,
        confirmPassword,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      onClose();
      await onAuthSuccess({ justRegistered: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogout = async () => {
    setBusyAction("logout");
    setError(null);
    try {
      await onSignOut();
      setEmailOrUsername("");
      setPassword("");
      onClose();
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setBusyAction("profile");
    setError(null);
    setProfileMessage(null);
    try {
      await api.updateProfile(editName.trim());
      await onAuthSuccess();
      setEditName("");
      setProfileMessage("Display name updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setBusyAction(null);
    }
  };

  const notesAndMoods = userRatings.filter(
    (r) => Boolean(r.note) || Boolean(r.mood_tag)
  );

  const wrapperClass = fullScreenGate
    ? "min-h-screen w-full bg-[#141414] text-neutral-100 flex flex-col items-center justify-center px-4 py-10"
    : "fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto";

  return (
    <div
      role={fullScreenGate ? "main" : "dialog"}
      aria-modal={fullScreenGate ? undefined : true}
      aria-label={user ? "User Profile, Watchlist, and Rating History" : "Account Sign In or Sign Up"}
      className={wrapperClass}
      onClick={(e) => {
        if (!fullScreenGate && e.target === e.currentTarget) onClose();
      }}
    >
      {fullScreenGate && (
        <div className="mb-6 text-center">
          <div className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#E50914]">
            PICKMYFLICK
          </div>
          <p className="mt-1 text-xs sm:text-sm text-neutral-400">
            Personalized Multilingual Movie Recommendation Platform
          </p>
        </div>
      )}
      <div
        className="relative w-full max-w-lg rounded-xl border border-white/15 bg-[#181818] p-6 shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!fullScreenGate && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="absolute right-4 top-4 z-20 inline-flex items-center justify-center rounded-full border border-white/20 bg-black/70 p-1.5 text-neutral-200 hover:bg-black hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {!user ? (
          <div>
            <h2 className="font-display text-xl font-bold text-white pr-8">
              {mode === "login" ? "Sign In to PICKMYFLICK" : "Create Your PICKMYFLICK Account"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {mode === "login"
                ? "Access your saved ratings, My List, and personalized Mult-VAE history."
                : "Sign up to save ratings, notes, and recommendation batches across sessions."}
            </p>

            {/* Distinct Sign In / Sign Up tabs */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="mt-4 flex gap-1 rounded-lg bg-[#141414] p-1 border border-white/10"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                disabled={isBusy}
                onClick={() => switchMode("login")}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "login"
                    ? "bg-[#E50914] text-white shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                disabled={isBusy}
                onClick={() => switchMode("register")}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "register"
                    ? "bg-[#E50914] text-white shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Sign Up
              </button>
            </div>

            {guestRatingCount > 0 && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-white/15 bg-[#141414] px-3.5 py-2.5 text-xs text-neutral-300">
                <UserCheck className="h-4 w-4 text-[#E50914] shrink-0 mt-0.5" />
                <span>
                  You have{" "}
                  <strong className="font-semibold text-white">
                    {guestRatingCount} guest {guestRatingCount === 1 ? "rating" : "ratings"}
                  </strong>{" "}
                  saved locally. They will merge automatically into your account when you sign in or sign up.
                </span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200"
              >
                {error}
              </div>
            )}

            {mode === "login" ? (
              <form noValidate onSubmit={handleLogin} className="mt-4 space-y-3.5">
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Email or Username
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    value={emailOrUsername}
                    onChange={(e) => {
                      setEmailOrUsername(e.target.value);
                      if (fieldErrors.emailOrUsername) {
                        setFieldErrors((prev) => ({ ...prev, emailOrUsername: undefined }));
                      }
                    }}
                    placeholder="you@university.edu or username"
                    aria-invalid={Boolean(fieldErrors.emailOrUsername)}
                    className={`w-full rounded-md border bg-[#141414] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                      fieldErrors.emailOrUsername
                        ? "border-rose-500 focus:border-rose-400"
                        : "border-white/15 focus:border-white/50"
                    }`}
                  />
                  {fieldErrors.emailOrUsername && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.emailOrUsername}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      placeholder="Enter your password"
                      aria-invalid={Boolean(fieldErrors.password)}
                      className={`w-full rounded-md border bg-[#141414] pl-3 pr-10 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                        fieldErrors.password
                          ? "border-rose-500 focus:border-rose-400"
                          : "border-white/15 focus:border-white/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#E50914] py-2.5 text-sm font-semibold text-white hover:bg-[#F40612] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {busyAction === "login" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>{busyAction === "login" ? "Signing In..." : "Sign In"}</span>
                </button>
              </form>
            ) : (
              <form noValidate onSubmit={handleRegister} className="mt-4 space-y-3.5">
                <div>
                  <label
                    htmlFor="register-full-name"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="register-full-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (fieldErrors.fullName) {
                        setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                      }
                    }}
                    placeholder="Alex Chen"
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    className={`w-full rounded-md border bg-[#141414] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                      fieldErrors.fullName
                        ? "border-rose-500 focus:border-rose-400"
                        : "border-white/15 focus:border-white/50"
                    }`}
                  />
                  {fieldErrors.fullName && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="register-email"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    placeholder="alex@university.edu"
                    aria-invalid={Boolean(fieldErrors.email)}
                    className={`w-full rounded-md border bg-[#141414] px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                      fieldErrors.email
                        ? "border-rose-500 focus:border-rose-400"
                        : "border-white/15 focus:border-white/50"
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="register-password"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Password (min 6 characters)
                  </label>
                  <div className="relative">
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      placeholder="At least 6 characters"
                      aria-invalid={Boolean(fieldErrors.password)}
                      className={`w-full rounded-md border bg-[#141414] pl-3 pr-10 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                        fieldErrors.password
                          ? "border-rose-500 focus:border-rose-400"
                          : "border-white/15 focus:border-white/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="register-confirm-password"
                    className="block text-xs font-medium text-neutral-300 mb-1"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirmPassword) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            confirmPassword: undefined,
                          }));
                        }
                      }}
                      placeholder="Re-enter your password"
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      className={`w-full rounded-md border bg-[#141414] pl-3 pr-10 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                        fieldErrors.confirmPassword
                          ? "border-rose-500 focus:border-rose-400"
                          : "border-white/15 focus:border-white/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={
                        showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#E50914] py-2.5 text-sm font-semibold text-white hover:bg-[#F40612] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {busyAction === "register" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>
                    {busyAction === "register" ? "Creating Account..." : "Create Account"}
                  </span>
                </button>
              </form>
            )}

            {!fullScreenGate && (
              <div className="mt-5 pt-4 border-t border-white/10 space-y-2.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClose}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#141414] px-3.5 py-2.5 text-left hover:bg-white/10 hover:border-white/25 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-200">
                      Continue as Guest
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {guestRatingCount > 0
                        ? `Preserves your ${guestRatingCount} local ratings and syncs when you sign in to a personal account.`
                        : "Rate movies locally without an account; ratings sync when you register."}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-neutral-300">
                    Skip →
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4 pr-8">
              <img
                src={user.avatar_url || DEFAULT_AVATAR}
                alt={user.display_name}
                referrerPolicy="no-referrer"
                className="h-14 w-14 rounded-full object-cover border border-white/20"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-white truncate">
                    {user.display_name}
                  </h2>
                  {user.is_demo ? (
                    <span className="rounded bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                      Demo Sandbox
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                      Personal Account
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 truncate">
                  @{user.username} · {user.email}
                </p>
                {userStats && (
                  <p className="mt-1 font-mono text-xs text-neutral-300 tabular-nums">
                    {userStats.ratingCount} movies rated · Avg {userStats.avgRating}/5 ·{" "}
                    {userStats.watchlistCount} in My List
                  </p>
                )}
              </div>
            </div>

            {user.is_demo && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3.5 py-2 text-[11px] text-amber-200">
                Signed into the shared <strong>Demo Researcher</strong> sandbox. Your data is isolated from personal registered accounts.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {error}
              </div>
            )}

            {profileMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-950/35 px-3 py-2 text-xs text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>{profileMessage}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="flex gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Update display name..."
                className="flex-1 rounded-md border border-white/15 bg-[#141414] px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-white/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isBusy || !editName.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/10 border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40 cursor-pointer"
              >
                {busyAction === "profile" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Save Name</span>
              </button>
            </form>

            {/* Quick Actions: Edit Preferences & Change Today's Mood */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditPreferences();
                }}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#141414] px-3.5 py-2.5 text-left hover:border-white/35 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Edit Preferences</p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    {preferences && preferences.preferredGenres.length > 0
                      ? preferences.preferredGenres.slice(0, 3).join(", ")
                      : "Languages, genres, actors & taste"}
                  </p>
                </div>
                <SlidersHorizontal className="h-4 w-4 text-[#E50914] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMoodPicker();
                }}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#141414] px-3.5 py-2.5 text-left hover:border-white/35 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Change Today&apos;s Mood</p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    {todayMood ? todayMood.moodLabel : "Set today's vibe"}
                  </p>
                </div>
                <Smile className="h-4 w-4 text-[#E50914] shrink-0" />
              </button>
            </div>

            {/* Profile sections: Watchlist, Rating History & Saved Preferences */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex gap-1 rounded-lg bg-[#141414] p-1 border border-white/10 mb-3">
                <button
                  type="button"
                  onClick={() => setProfileTab("watchlist")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    profileTab === "watchlist"
                      ? "bg-[#E50914] text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>My List ({watchlist.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab("history")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    profileTab === "history"
                      ? "bg-[#E50914] text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>Ratings ({userRatings.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab("preferences")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    profileTab === "preferences"
                      ? "bg-[#E50914] text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Preferences</span>
                </button>
              </div>

              {profileTab === "watchlist" ? (
                watchlist.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-2">
                    No movies saved to My List yet. Click My List on any movie card to bookmark it.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {watchlist.map((m) => (
                      <div
                        key={m.movielens_id ?? m.title}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#141414] p-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectMovie(m);
                            onClose();
                          }}
                          className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="h-12 w-8 shrink-0 rounded overflow-hidden">
                            <MoviePoster
                              posterUrl={m.poster_url}
                              title={m.title}
                              releaseYear={m.release_year}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate hover:text-neutral-300">
                              {m.title}
                            </p>
                            <p className="text-xs text-neutral-400 truncate">
                              {m.release_year} · {m.genres.slice(0, 2).join(", ")}
                            </p>
                          </div>
                        </button>
                        {m.movielens_id != null && (
                          <button
                            type="button"
                            onClick={() => void onRemoveWatchlist(m.movielens_id!)}
                            aria-label={`Remove ${m.title} from My List`}
                            className="p-1.5 text-neutral-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : profileTab === "history" ? (
                userRatings.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-2">
                    You haven&apos;t rated any movies yet. Head to Rate Movies or apply a Starter Pack to build your taste profile.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {userRatings.slice(0, 20).map((r) => (
                      <div
                        key={`history-${r.movielens_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#141414] px-3 py-2"
                      >
                        <button
                          type="button"
                          disabled={!r.movie}
                          onClick={() => {
                            if (r.movie) {
                              onSelectMovie(r.movie);
                              onClose();
                            }
                          }}
                          className="text-left min-w-0 flex-1 cursor-pointer disabled:cursor-default"
                        >
                          <p className="text-xs font-medium text-white truncate hover:text-neutral-300">
                            {r.movie?.title ?? `Movie #${r.movielens_id}`}
                          </p>
                          {(r.mood_tag || r.note) && (
                            <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
                              {r.mood_tag ? `[${r.mood_tag}] ` : ""}
                              {r.note ?? ""}
                            </p>
                          )}
                        </button>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs text-amber-300 tabular-nums shrink-0">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {r.rating}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-white/10 bg-[#141414] p-3.5 space-y-2.5 text-xs">
                  <div>
                    <span className="text-neutral-400">Original Languages: </span>
                    <span className="text-white">
                      {preferences?.originalLanguages?.length
                        ? preferences.originalLanguages
                            .map((c) => LANGUAGE_NAME_BY_CODE[c] ?? c)
                            .join(", ")
                        : preferences?.preferredLanguages?.length
                        ? preferences.preferredLanguages
                            .map((c) => LANGUAGE_NAME_BY_CODE[c] ?? c)
                            .join(", ")
                        : "Not set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Dubbed Languages: </span>
                    <span className="text-white">
                      {preferences?.dubbedLanguages?.length
                        ? preferences.dubbedLanguages
                            .map((c) => LANGUAGE_NAME_BY_CODE[c] ?? c)
                            .join(", ")
                        : "None selected"}
                    </span>
                    {preferences?.languageMode && (
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-neutral-300">
                        {preferences.languageMode === "both"
                          ? "Original + Dubbed"
                          : `${preferences.languageMode} only`}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-neutral-400">Genres: </span>
                    <span className="text-white">
                      {preferences?.favoriteGenres?.length
                        ? preferences.favoriteGenres.join(", ")
                        : preferences?.preferredGenres?.length
                        ? preferences.preferredGenres.join(", ")
                        : "Not set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Favourite Heroes: </span>
                    <span className="text-white">
                      {preferences?.favoriteMaleActors?.length
                        ? preferences.favoriteMaleActors.join(", ")
                        : "Not set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Favourite Heroines: </span>
                    <span className="text-white">
                      {preferences?.favoriteFemaleActors?.length
                        ? preferences.favoriteFemaleActors.join(", ")
                        : "Not set"}
                    </span>
                  </div>
                  {preferences?.characterTypes && preferences.characterTypes.length > 0 && (
                    <div>
                      <span className="text-neutral-400">Character Types: </span>
                      <span className="text-white">
                        {preferences.characterTypes.join(", ")}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-neutral-400">Movie Taste: </span>
                    <span className="text-white">
                      {[
                        preferences?.tasteStyle,
                        ...(preferences?.storyStyles ?? []),
                        preferences?.pacingPreference &&
                        preferences.pacingPreference !== "balanced"
                          ? preferences.pacingPreference.replace("_", "-")
                          : null,
                        preferences?.runtimePreference &&
                        preferences.runtimePreference !== "any"
                          ? `${preferences.runtimePreference} runtime`
                          : null,
                        preferences?.eraPreference &&
                        preferences.eraPreference !== "any"
                          ? `${preferences.eraPreference} era`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not set"}
                    </span>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenEditPreferences();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#E50914] hover:bg-[#F40612] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Edit Preferences</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Notes & Mood Tags */}
            {notesAndMoods.length > 0 && profileTab === "watchlist" && (
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2.5">
                  <MessageSquareQuote className="h-4 w-4 text-[#E50914]" />
                  <h3 className="font-display text-xs font-semibold text-white">
                    Recent Notes &amp; Mood Tags
                  </h3>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                  {notesAndMoods.slice(0, 4).map((r) => (
                    <div
                      key={`profile-note-${r.movielens_id}`}
                      className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-neutral-100 truncate">
                          {r.movie?.title ?? `Movie #${r.movielens_id}`}
                        </span>
                        <span className="font-mono text-amber-300 tabular-nums shrink-0">
                          {r.rating}/5
                          {r.mood_tag ? ` · ${r.mood_tag}` : ""}
                        </span>
                      </div>
                      {r.note && (
                        <p className="mt-1 text-neutral-400 italic">&ldquo;{r.note}&rdquo;</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-[11px] text-neutral-400">
                Session saved securely via Bearer token
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-md border border-[#E50914]/50 bg-[#E50914]/15 px-4 py-2 text-xs font-semibold text-white hover:bg-[#E50914] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {busyAction === "logout" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                <span>{busyAction === "logout" ? "Signing Out..." : "Sign Out"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
