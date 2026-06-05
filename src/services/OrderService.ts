import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
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

        // Scalability: Consider adding where("status", "in", ["pending", "accepted", "started"])
        const ordersRef = collection(db, "orders");
        const ordersQuery = query(ordersRef, orderBy("timestamp", "desc"));
        this.unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
          this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Order));
          this.emit('ordersUpdated', this.orders);
        }, (err) => {
          if (err.code !== 'permission-denied') console.error("Firestore Orders Error:", err);
        });

        // Listen to user profile for role and subscription
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

      const subDate = data.subscriptionUntil instanceof Timestamp
        ? data.subscriptionUntil.toDate()
        : new Date(data.subscriptionUntil);

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

      console.log('Uploading to:', filename);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      console.log('Upload successful, URL:', url);
      return url;
    } catch (err) {
      console.error('Firebase storage upload failed:', err);
      throw err;
    }
  }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");

    const orderData: any = {
      title: data.title || '',
      address: data.address || '',
      price: data.price ? Number(data.price) : 0,
      details: data.details || '',
      date: data.date || new Date().toISOString(),
      images: data.images as string[] || [],
      employerId: auth.currentUser.uid,
      status: 'pending' as OrderStatus,
      squareMeters: 0,
      perimeter: 0,
      fixturesCount: 0,
      chandeliersCount: 0,
      curtainRodsCount: 0,
      time: '',
      location: data.location || data.coordinates || { latitude: 55.751244, longitude: 37.618423 },
      coordinates: data.coordinates || data.location || { latitude: 55.751244, longitude: 37.618423 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timestamp: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "orders"), orderData);
      console.log('Order created successfully with ID:', docRef.id);

      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
          ordersCount: increment(1)
        });
      } catch (e) {
        console.warn("Failed to increment ordersCount:", e);
      }

      return docRef;
    } catch (error: any) {
      console.error("Error creating order in Firestore:", error);
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

    const orderRef = doc(db, "orders", orderId);
    return updateDoc(orderRef, {
      candidates: arrayUnion(candidate)
    });
  }

  async confirmWorker(orderId: string, worker: any) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      workerId: worker.id,
      status: 'accepted' as OrderStatus
    });
    await notificationService.notifyStatusChange(orderId, worker.id, 'accepted');
  }

  async updateOrder(orderId: string, data: any) {
    const orderRef = doc(db, "orders", orderId);
    return updateDoc(orderRef, {
      ...data,
      updatedAt: Date.now(),
    });
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      status,
      updatedAt: Date.now()
    });

    try {
        const orderSnap = await getDoc(orderRef);
        const orderData = orderSnap.data() as Order;

        if (this.currentRole === 'worker' && orderData.employerId) {
            await notificationService.notifyStatusChange(orderId, orderData.employerId, status);
        } else if (this.currentRole === 'employer' && orderData.workerId) {
            await notificationService.notifyStatusChange(orderId, orderData.workerId, status);
        }
    } catch (e) {
        console.error("Error in updateStatus notification:", e);
    }
  }

  async deleteOrder(orderId: string) {
    const orderRef = doc(db, "orders", orderId);
    return deleteDoc(orderRef);
  }

  async togglePin(orderId: string, currentPinStatus: boolean) {
    const orderRef = doc(db, "orders", orderId);
    return updateDoc(orderRef, {
      isPinned: !currentPinStatus,
      updatedAt: Date.now()
    });
  }

  async savePrivateData(userId: string, data: any) {
    const privateRef = doc(db, "users", userId, "private", "data");
    return setDoc(privateRef, data, { merge: true });
  }

  async getPrivatePhone(userId: string): Promise<string> {
    try {
      const privateRef = doc(db, "users", userId, "private", "data");
      const snap = await getDoc(privateRef);
      return snap.exists() ? snap.data().phoneNumber : '';
    } catch (e) {
      console.warn("Permission denied for private phone:", e);
      return '';
    }
  }
}

export const orderService = new OrderService();
export type { Order };
