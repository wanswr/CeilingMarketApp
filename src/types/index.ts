export type OrderStatus = 'PENDING' | 'PUBLISHED' | 'HAS_RESPONSES' | 'CLAIMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTE' | 'REVIEWED';

export type WorkType = 'FROZE' | 'INSTALLATION' | 'SERVICE' | 'REPAIR' | 'OTHER';
export interface LatLng { latitude: number; longitude: number; }

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface Review {
  id: string;
  orderId: string;
  authorId: string;
  targetId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    avatar?: string;
  };
  target?: {
    id: string;
    name: string;
    avatar?: string;
  };
  order?: {
    id: string;
    title: string;
  };
}

export interface UserProfile {
  id: string;
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
  subscription?: {
    id: string;
    isActive: boolean;
    activeUntil: string;
  };
  isTrialUsed: boolean;
  pushToken?: string;
  portfolio?: string[];
  activeCategoryId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Application {
  id: string;
  orderId: string;
  executorId: string;
  price?: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: number;
  executor?: UserProfile;
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
  workType: WorkType;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  comments?: string;
  details?: string;
  description?: string;
  candidates?: any[];
  applications?: Application[];
  executorId?: string;
  images?: string[];
  timestamp?: any;
  isPinned?: boolean;
  distance?: number;
  employer?: UserProfile;
  executor?: UserProfile;
  reviews?: Review[];
  statusHistory?: any[];
  claimedAt?: string | Date;
  categoryId?: string;
}
