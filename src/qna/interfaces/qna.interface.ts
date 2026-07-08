export interface Question {
  id: string;
  question: string;
  author: string;
  email?: string;
  phone?: string;
  answer?: string;
  answered_by?: string;
  status: 'pending' | 'approved' | 'hidden';
  created_at: number;
  updated_at: number;
  answered_at?: number;
  productTitle?: string;
  productName?: string;
  productHandle?: string;
  productImage?: string;
  source_raw_json?: string;
}

export interface QnaSummary {
  total: number;
  answered: number;
  unanswered: number;
}
