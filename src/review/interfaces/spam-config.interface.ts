export interface SpamConfig {
  minRating: number;
  blockedWords: string[];
  maxContentLength: number;
}

export const DEFAULT_SPAM_CONFIG: SpamConfig = {
  minRating: 1,
  blockedWords: [],
  maxContentLength: 5000,
};
