import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  Timestamp,
  setDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, storage } from './firebase';
import { Order, OrderStatus } from '../types';
import { notificationService } from './NotificationService';

class OrderService {
  private orders: Order[] = [];
  private listeners: { [key: string]: Function[] } = {};
  private currentRole: 'employer' | 'worker' = 'employer';
  private unsubscribe: (() => void) | null = null;
  private userUnsubscribe: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        if (this.unsubscribe) this.unsubscribe();
        if (this.userUnsubscribe) this.userUnsubscribe();

        const ordersRef = collection(db, "orders");
        const ordersQuery = query(ordersRef, orderBy("timestamp", "desc"));
        this.unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
          this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Order));
          this.emit('ordersUpdated', this.orders);
        }, (err) => {
          if (err.code !== 'permission-denied') console.error("Firestore Orders Error:", err);
        });

        const userRef = doc(db, "users", user.uid);
        this.userUnsubscribe = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data?.role && data.role !== this.currentRole) {
              this.currentRole = data.role;
              this.emit('roleChanged', data.role);
            }
          }
        }, (err) => {
          if (err.code !== 'permission-denied') console.error("Firestore User Error:", err);
        });
      } else {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
        if (this.userUnsubscribe) { this.userUnsubscribe(); this.userUnsubscribe = null; }
        this.orders = [];
        this.emit('ordersUpdated', []);
      }
    });
  }

  on(event: string, cb: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  off(event: string, cb: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== cb);
    }
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) this.listeners[event].forEach((cb: any) => cb(data));
  }

  getOrders() { return [...this.orders]; }
  getCurrentRole(): 'employer' | 'worker' { return this.currentRole; }

  async checkSubscription(): Promise<boolean> {
    if (!auth.currentUser) return false;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const snapshot = await getDoc(userRef);
      if (!snapshot.exists()) return false;
      const data = snapshot.data();
      if (data?.isSubscribed === true) return true;
      if (!data?.subscriptionUntil) return false;
      const subDate = data.subscriptionUntil instanceof Timestamp ? data.subscriptionUntil.toDate() : new Date(data.subscriptionUntil);
      return subDate > new Date();
    } catch {
      return false;
    }
  }

  async setRole(role: 'employer' | 'worker') {
    this.currentRole = role;
    this.emit('roleChanged', role);
    if (auth.currentUser) {
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, { role });
      } catch (e) {
        console.error("Failed to persist role change:", e);
      }
    }
  }

  async uploadImage(uri: string): Promise<string> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `orders/${auth.currentUser?.uid || 'anon'}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (err) {
      console.warn('Firebase storage upload failed (probably no subscription):', err);
      return uri; // Fallback to local URI
    }
  }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    const orderData: any = {
      ...data,
      employerId: auth.currentUser.uid,
      status: 'pending' as OrderStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timestamp: serverTimestamp(),
    };
    try {
      const docRef = await addDoc(collection(db, "orders"), orderData);
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { ordersCount: increment(1) }).catch(() => {});
      return docRef;
    } catch (error: any) {
      console.error("Error creating order:", error);
      throw error;
    }
  }

  async applyForOrder(orderId: string, workerId: string) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    const candidate = {
      id: auth.currentUser.uid,
      name: userData?.name || 'Мастер',
      timestamp: Date.now()
    };
    return updateDoc(doc(db, "orders", orderId), { candidates: arrayUnion(candidate) });
  }

  async confirmWorker(orderId: string, worker: any) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, { workerId: worker.id, status: 'accepted' as OrderStatus });
    await notificationService.notifyStatusChange(orderId, worker.id, 'accepted');
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, { status, updatedAt: Date.now() });
    try {
        const orderSnap = await getDoc(orderRef);
        const orderData = orderSnap.data() as Order;
        const targetId = this.currentRole === 'worker' ? orderData.employerId : orderData.workerId;
        if (targetId) await notificationService.notifyStatusChange(orderId, targetId, status);
    } catch (e) {}
  }

  async updateOrder(orderId: string, data: any) { return updateDoc(doc(db, "orders", orderId), { ...data, updatedAt: Date.now() }); }
  async deleteOrder(orderId: string) { return deleteDoc(doc(db, "orders", orderId)); }
  async togglePin(orderId: string, currentPinStatus: boolean) { return updateDoc(doc(db, "orders", orderId), { isPinned: !currentPinStatus, updatedAt: Date.now() }); }
  async savePrivateData(userId: string, data: any) { return setDoc(doc(db, "users", userId, "private", "data"), data, { merge: true }); }
  async getPrivatePhone(userId: string): Promise<string> {
    try {
      const snap = await getDoc(doc(db, "users", userId, "private", "data"));
      return snap.exists() ? snap.data().phoneNumber : '';
    } catch { return ''; }
  }
}

export const orderService = new OrderService();
export type { Order };
