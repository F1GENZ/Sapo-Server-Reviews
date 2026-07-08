export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export type ReviewStatus = 'approved' | 'pending' | 'hidden' | 'spam';

export interface Review {
  id: string;
  rating: number;
  content: string;
  author: string;
  email?: string;
  phone?: string;
  title?: string;
  media: MediaItem[];
  status: ReviewStatus;
  verified?: boolean;
  pinned?: boolean;
  reply?: string;
  replied_at?: number;
  source_raw_json?: string;
  created_at: number;
  updated_at: number;
}

export interface RatingSummary {
  avg: number;
  count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}
