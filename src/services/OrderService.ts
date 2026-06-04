import {
  collection,
  addDoc,
  query,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Order, UserProfile, UserRole } from '../types';

class OrderService {
  private orders: Order[] = [];
  private listeners: any = {};
  private currentRole: UserRole = 'worker';

  constructor() {
    this.initOrdersListener();
  }

  private initOrdersListener() {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
      this.orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      this.emit('ordersUpdated', this.orders);
    }, (err) => console.warn("Firestore Orders Error:", err));
  }

  on(event: string, cb: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  off(event: string, cb: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((l: any) => l !== cb);
    }
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) this.listeners[event].forEach((cb: any) => cb(data));
  }

  // Role Management
  getCurrentRole(): UserRole {
    return this.currentRole;
  }

  setRole(role: UserRole) {
    this.currentRole = role;
    this.emit('roleChanged', role);
  }

  // User Management
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  }

  async createUserProfile(uid: string, data: Partial<UserProfile>) {
    const trialDays = 7;
    const trialUntil = Date.now() + trialDays * 24 * 60 * 60 * 1000;

    const profile: UserProfile = {
      uid,
      role: data.role || 'worker',
      fio: data.fio || '',
      birthDate: data.birthDate || '',
      isVerified: false,
      isTrialUsed: true,
      trialUntil,
      createdAt: Date.now(),
      socialLinks: {},
      portfolio: [],
      stats: { rating: 10, reviewsCount: 0, completedOrders: 0, createdOrders: 0 },
      ...data
    };

    await setDoc(doc(db, "users", uid), profile);
    return profile;
  }

  async updateProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, data);
  }

  // Order Management
  getOrders() { return [...this.orders]; }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    const newOrder = {
      ...data,
      employerId: auth.currentUser.uid,
      status: 'pending',
      candidates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return addDoc(collection(db, "orders"), newOrder);
  }

  async applyForOrder(orderId: string, userId: string) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      candidates: arrayUnion(userId)
    });
  }

  async confirmWorker(orderId: string, workerId: string) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      workerId,
      status: 'accepted',
      updatedAt: Date.now()
    });
  }

  async updateStatus(orderId: string, status: string) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      status,
      updatedAt: Date.now()
    });
  }
}

export const orderService = new OrderService();
export type { Order, UserProfile, UserRole };
