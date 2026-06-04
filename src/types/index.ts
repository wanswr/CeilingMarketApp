export type OrderStatus = 'new' | 'accepted' | 'in_progress' | 'finished' | 'paid' | 'cancelled' | 'pending';

export type UserRole = 'worker' | 'employer';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface SocialLinks {
  instagram?: string;
  telegram?: string;
}

export interface UserStats {
  rating: number; // 0-10
  completedOrders?: number;
  createdOrders?: number;
  completionRate?: number; // for workers
  responseSpeed?: string; // for employers
  reviewsCount: number;
}

export interface UserProfile {
  uid: string;
  role: UserRole;
  fio: string;
  birthDate?: string;
  photoUrl?: string;
  isVerified: boolean;
  city?: string;
  trialUntil: number; // timestamp
  isTrialUsed: boolean;
  socialLinks: SocialLinks;
  portfolio: string[]; // urls
  stats: UserStats;
  createdAt: number;
}

export interface Order {
  id: string;
  employerId: string;
  workerId?: string;
  title: string;
  address: string;
  location: LatLng;
  date: string;
  time: string;
  price: number;
  details?: string;
  squareMeters?: number;
  perimeter?: number;
  fixturesCount?: number;
  chandeliersCount?: number;
  curtainRodsCount?: number;
  status: OrderStatus;
  candidates: string[]; // array of uids
  createdAt: number;
  updatedAt: number;
  comments?: string;
  images?: string[];
}
