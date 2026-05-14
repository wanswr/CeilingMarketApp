export type OrderStatus = 'new' | 'accepted' | 'in_progress' | 'finished' | 'paid' | 'cancelled';
export interface LatLng { latitude: number; longitude: number; }
export interface Order {
  id: string; employerId: string; title: string; address: string;
  location: LatLng; date: string; time: string; price: number;
  squareMeters: number; perimeter: number; fixturesCount: number;
  chandeliersCount: number; curtainRodsCount: number; status: OrderStatus;
  createdAt: number; updatedAt: number; comments?: string;
}