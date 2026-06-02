export type OrderStatus = 'new' | 'accepted' | 'in_progress' | 'finished' | 'paid' | 'cancelled' | 'pending' | 'in_work' | 'executing' | 'started';
export interface LatLng { latitude: number; longitude: number; }
export interface Order {
  id: string;
  employerId: string;
  title: string;
  address: string;
  location: LatLng;
  coordinates?: LatLng;
  date: string;
  time: string;
  price: number;
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
}