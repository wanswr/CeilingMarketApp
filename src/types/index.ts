export type OrderStatus = 'CREATED' | 'PUBLISHED' | 'CLAIMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTE';
export interface LatLng { latitude: number; longitude: number; }
export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  role: 'worker' | 'employer';
  avatar?: string;
  rating: number;
  experience?: number;
  ordersCount: number;
  completedOrders: number;
  instagram?: string;
  telegram?: string;
  isVerified: boolean;
  subscriptionUntil?: string;
  isTrialUsed: boolean;
  pushToken?: string;
  portfolio?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Order {
  id: string;
  employerId: string;
  title: string;
  address: string;
  location?: LatLng;
  coordinates?: LatLng;
  latitude?: number;
  longitude?: number;
  date: string;
  time: string;
  price: number | string;
  squareMeters: number;
  perimeter: number;
  fixturesCount: number;
  chandeliersCount: number;
  curtainRodsCount: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  comments?: string;
  details?: string;
  candidates?: any[];
  workerId?: string;
  images?: string[];
  timestamp?: any;
  isPinned?: boolean;
  distance?: number;
}
