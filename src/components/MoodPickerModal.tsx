import {
  Award,
  Brain,
  Check,
  Eye,
  Flame,
  Ghost,
  Heart,
  HeartCrack,
  History,
  Laugh,
  Loader2,
  Smile,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  DAILY_MOODS,
  getTodayDateString,
  type DailyMoodOption,
} from "../data/preferencesData";
import type { DailyMood } from "../types";

interface MoodPickerModalProps {
  open: boolean;
  todayMood: DailyMood | null;
  onClose: () => void;
  onSelectMood: (option: DailyMoodOption) => Promise<void>;
  onClearMood: () => Promise<void>;
}

export const MOOD_ICON_MAP: Record<string, typeof Smile> = {
  "Feel-good": Smile,
  Romantic: Heart,
  Comedy: Laugh,
  Action: Flame,
  Suspense: Eye,
  Thriller: Zap,
  Horror: Ghost,
  Emotional: HeartCrack,
  Inspirational: Award,
  "Family time": Users,
  "Mind-bending": Brain,
  Nostalgic: History,
};

export function MoodPickerModal({
  open,
  todayMood,
  onClose,
  onSelectMood,
  onClearMood,
}: MoodPickerModalProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const todayDate = getTodayDateString();

  const handlePick = async (opt: DailyMoodOption) => {
    setBusyKey(opt.key);
    setError(null);
    try {
      await onSelectMood(opt);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save today's mood.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleClear = async () => {
    setBusyKey("clear");
    setError(null);
    try {
      await onClearMood();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear today's mood.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change Today's Mood"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-white/15 bg-[#181818] p-6 shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mood picker"
          className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full border border-white/20 bg-black/70 p-1.5 text-neutral-200 hover:bg-black hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-8">
          <p className="text-xs font-bold uppercase tracking-wider text-[#E50914]">
            Daily Vibe · {todayDate}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            Change Today&apos;s Mood
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Saved specifically for today without overwriting your genre preferences or altering trained model weights.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {DAILY_MOODS.map((opt) => {
            const Icon = MOOD_ICON_MAP[opt.key] ?? Sparkles;
            const active = todayMood?.moodKey === opt.key;
            const loading = busyKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={busyKey !== null}
                onClick={() => void handlePick(opt)}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                  active
                    ? "border-[#E50914] bg-[#E50914]/15 text-white"
                    : "border-white/10 bg-[#141414] text-neutral-200 hover:border-white/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-[#E50914]" : "text-neutral-300"
                      }`}
                    />
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </div>
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E50914]" />
                  ) : active ? (
                    <Check className="h-4 w-4 text-[#E50914]" />
                  ) : null}
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400 line-clamp-2">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>

        {todayMood && (
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              Active today: <strong className="text-white">{todayMood.moodLabel}</strong>
            </span>
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() => void handleClear()}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Today&apos;s Mood</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
