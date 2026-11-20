export type LanguageCode = "en" | "hi" | "kn" | "te" | "ta" | "ml";
export type LanguagePreferenceMode = "original" | "dubbed" | "both";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_demo?: boolean;
  created_at: string;
}

export interface UserPreferences {
  preferredLanguages: string[];
  originalLanguages: string[];
  dubbedLanguages: string[];
  languageMode: LanguagePreferenceMode;
  preferredGenres: string[];
  favoriteGenres: string[];
  favoriteActors: string[];
  favoriteMaleActors: string[];
  favoriteFemaleActors: string[];
  characterTypes: string[];
  tasteStyle: string | null;
  tasteMovieIds: number[];
  storyStyles: string[];
  pacingPreference: "fast_paced" | "slow_burn" | "balanced";
  runtimePreference: "short" | "standard" | "long" | "any";
  eraPreference: "classic" | "recent" | "any";
  setupCompleted: boolean;
  skippedSteps: number[];
  updatedAt?: string | null;
}

export interface DailyMood {
  moodDate: string;
  moodKey: string;
  moodLabel: string;
  updatedAt?: string;
}

export interface UserStats {
  ratingCount: number;
  avgRating: number;
  watchlistCount: number;
}

export interface Movie {
  movielens_id: number | null;
  item_idx: number;
  tmdb_id: number | null;
  imdb_id: string | null;
  title: string;
  original_title?: string | null;
  language_code?: string;
  is_dubbed?: boolean;
  available_dubs?: string[];
  runtime?: number | null;
  cast?: string[];
  director?: string | null;
  mood_tags?: string[];
  story_tags?: string[];
  catalog_origin?: string;
  release_year: number | null;
  genres: string[];
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  vote_average: number | null;
  vote_count: number | null;
  ml_rating_count: number;
  ml_avg_rating: number;
  metadata_source: string;
  latent_similarity?: number;
}

export interface DiscoverResponse {
  featured: Movie | null;
  trending: Movie[];
  popular: Movie[];
  top_rated: Movie[];
  upcoming: Movie[];
  tmdb_configured: boolean;
  source: string;
}

export interface UserRating {
  id: number;
  movielens_id: number;
  rating: number;
  note?: string | null;
  mood_tag?: string | null;
  created_at: string;
  updated_at: string;
  movie: Movie | null;
}

export type AlgorithmType = "multvae" | "mf" | "popularity";
export type DiscoveryMode = "top_ranked" | "hidden_gems";

export interface RecommendationItem {
  historyId: number;
  rank: number;
  score: number;
  normalizedScore: number;
  similarToTitle?: string | null;
  anchorMovieTitle?: string | null;
  anchorMovieRating?: number | null;
  anchorSimilarity?: number | null;
  itemRatingCount?: number;
  discoveryMode?: DiscoveryMode;
  explanation: string;
  feedback: "like" | "dislike" | null;
  movie: Movie | null;
}

export interface DiscoverySectionItem {
  movie: Movie;
  score: number;
  normalizedScore: number;
  strategy: "multvae" | "cold_start_metadata" | "hybrid";
  reason: string;
  matchedSignals?: string[];
}

export interface DiscoverySection {
  id:
    | "recommended_for_you"
    | "todays_mood_picks"
    | "because_you_like_actors"
    | "based_on_favourite_genres"
    | "regional_cinema_for_you"
    | "discover_something_new";
  title: string;
  subtitle: string;
  strategyLabel: string;
  items: DiscoverySectionItem[];
}

export interface DiscoverySectionsResponse {
  sections: DiscoverySection[];
  surprisePick: DiscoverySectionItem | null;
  activeMood: string | null;
  ratedMoviesCount: number;
  coldStartActive: boolean;
  refreshedAt: string;
}

export interface EpochMetric {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  reconLoss: number;
  klLoss: number;
  beta: number;
  valRecall20: number;
}

export interface TrainingRun {
  id: number;
  model_type: string;
  status: string;
  dataset_name: string;
  hyperparameters: Record<string, number>;
  epochs_planned: number;
  epochs_completed: number;
  final_train_loss: number | null;
  final_val_loss: number | null;
  final_recon_loss: number | null;
  final_kl_loss: number | null;
  epoch_history: EpochMetric[];
  checkpoint_path: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface EvaluationResult {
  id: number;
  run_id: number | null;
  model_type: AlgorithmType;
  dataset_name: string;
  num_eval_users: number;
  num_catalog_items: number;
  recall_at_20: number;
  ndcg_at_100: number;
  catalog_coverage: number;
  evaluated_at: string;
}

export interface MLStatusResponse {
  dataset: {
    dataset_name: string;
    num_total_movies: number;
    num_rated_items: number;
    num_users: number;
    total_ratings: number;
    matched_tmdb_ids: number;
    split_protocol: string;
    train_interactions: number;
    val_interactions: number;
    test_interactions: number;
    positive_train: number;
    positive_val: number;
    positive_test: number;
  };
  liveTraining: {
    running: boolean;
    modelType: string | null;
    runId: number | null;
    currentEpoch: number;
    totalEpochs: number;
    message: string;
    epochHistory: EpochMetric[];
    error: string | null;
  };
  checkpoints: {
    multvae: { saved: boolean; config: Record<string, number> | null };
    mf: { saved: boolean; config: Record<string, number> | null };
    popularity: { saved: boolean; loaded: boolean };
  };
  trainingRuns: TrainingRun[];
  evaluationResults: EvaluationResult[];
}

export interface UserInsights {
  totalRated: number;
  avgRating: number;
  mostPreferredGenre: string | null;
  highestRatedGenres: Array<{ genre: string; count: number; avgRating: number }>;
  ratingDistribution: Array<{ stars: string; starValue: number; count: number }>;
  genreAnalytics: Array<{ genre: string; count: number; avgRating: number }>;
  moodTagSummary?: Array<{ tag: string; count: number; avgRating: number }>;
  ratedNotes?: Array<{
    movielens_id: number;
    title: string;
    release_year: number | null;
    rating: number;
    note: string | null;
    mood_tag: string | null;
    updated_at: string;
  }>;
  viewedMovies?: Array<{
    movielens_id: number;
    title: string;
    release_year: number | null;
    genres: string[];
    viewed_at: string;
  }>;
  recStats: Array<{
    algorithm: string;
    generatedCount: number;
    likes: number;
    dislikes: number;
  }>;
  recentRecommendations: Array<{
    algorithm: string;
    rank: number;
    score: number;
    feedback: string | null;
    created_at: string;
    title: string;
    release_year: number | null;
  }>;
}
