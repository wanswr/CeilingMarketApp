import firebase from 'firebase/compat/app';
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
    auth.onAuthStateChanged((user) => {
      if (user) {
        if (this.unsubscribe) this.unsubscribe();
        if (this.userUnsubscribe) this.userUnsubscribe();

        // Listen to orders
        this.unsubscribe = db.collection("orders")
          .orderBy("timestamp", "desc")
          .onSnapshot((snapshot) => {
            this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Order));
            this.emit('ordersUpdated', this.orders);
          }, (err) => {
            if (err.code !== 'permission-denied') console.error("Firestore Orders Error:", err);
          });

        // Listen to user profile for role and subscription
        this.userUnsubscribe = db.collection("users").doc(user.uid)
          .onSnapshot((doc) => {
            if (doc.exists) {
              const data = doc.data();
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
      const doc = await db.collection("users").doc(auth.currentUser.uid).get();
      if (!doc.exists) return false;
      const data = doc.data();
      if (!data?.subscriptionUntil) return false;
      return new Date(data.subscriptionUntil) > new Date();
    } catch {
      return false;
    }
  }

  async setRole(role: 'employer' | 'worker') {
    this.currentRole = role;
    this.emit('roleChanged', role);
    if (auth.currentUser) {
      try {
        await db.collection("users").doc(auth.currentUser.uid).update({ role });
      } catch (e) {
        console.error("Failed to persist role change:", e);
      }
    }
  }

  async uploadImage(uri: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const blob = xhr.response;
        const filename = `orders/${auth.currentUser?.uid || 'anon'}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const ref = storage.ref().child(filename);

        console.log('Uploading to:', filename);
        ref.put(blob)
          .then((snapshot) => snapshot.ref.getDownloadURL())
          .then((url) => {
            console.log('Upload successful, URL:', url);
            resolve(url);
          })
          .catch((err) => {
            console.error('Firebase storage upload failed:', err);
            reject(err);
          });
      };
      xhr.onerror = function (e) {
        console.error('XHR Error:', e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }

  async uploadImageLegacy(uri: string): Promise<string> {
    try {
      console.log('Starting image upload for:', uri);
      // For React Native, it's often better to use XMLHttpRequest for blobs if fetch fails
      const response = await fetch(uri);
      const blob = await response.blob();

      const filename = `orders/${auth.currentUser?.uid || 'anon'}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const ref = storage.ref().child(filename);

      console.log('Uploading to:', filename);
      const snapshot = await ref.put(blob);
      console.log('Upload successful');

      const downloadURL = await snapshot.ref.getDownloadURL();
      console.log('Download URL:', downloadURL);
      return downloadURL;
    } catch (error: any) {
      console.error('Error in uploadImage:', error);
      // Log more details if available
      if (error.code) console.error('Error code:', error.code);
      if (error.serverResponse) console.error('Server response:', error.serverResponse);
      throw error;
    }
  }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");

    const orderData: Partial<Order> = {
      title: data.title || '',
      address: data.address || '',
      price: data.price ? Number(data.price) : 0,
      details: data.details || '',
      date: data.date || new Date().toISOString(),
      images: data.images as string[] || [],
      employerId: auth.currentUser.uid,
      status: 'pending',
      // Fields to satisfy the Order interface if needed by rules
      squareMeters: 0,
      perimeter: 0,
      fixturesCount: 0,
      chandeliersCount: 0,
      curtainRodsCount: 0,
      time: '',
      // Use provided location or default to Moscow coordinates for testing
      location: data.location || data.coordinates || { latitude: 55.751244, longitude: 37.618423 },
      coordinates: data.coordinates || data.location || { latitude: 55.751244, longitude: 37.618423 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      // Deep sanitize data: remove undefined values and ensure types
      const sanitizedData = JSON.parse(JSON.stringify({
        ...orderData,
        timestamp: Date.now(),
      }));

      console.log('Attempting to create order with sanitized data:', JSON.stringify(sanitizedData, null, 2));
      const docRef = await db.collection("orders").add(sanitizedData);
      console.log('Order created successfully with ID:', docRef.id);
      return docRef;
    } catch (error: any) {
      console.error("Error creating order in Firestore:", error);
      if (error.code === 'permission-denied') {
        console.error("Permission denied. Check if user is logged in and Firestore rules allow writing to 'orders'.");
      }
      throw error;
    }
  }

  async applyForOrder(orderId: string, workerId: string) {
    if (!auth.currentUser) throw new Error("Не авторизован");

    // Add current user to candidates array
    const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
    const userData = userDoc.data();

    const candidate = {
      id: auth.currentUser.uid,
      name: userData?.name || 'Мастер',
      phone: userData?.phone || '',
      timestamp: Date.now()
    };

    return db.collection("orders").doc(orderId).update({
      candidates: firebase.firestore.FieldValue.arrayUnion(candidate)
    });
  }

  async confirmWorker(orderId: string, worker: any) {
    await db.collection("orders").doc(orderId).update({
      workerId: worker.id,
      status: 'accepted'
    });
    // Notify worker
    await notificationService.notifyStatusChange(orderId, worker.id, 'accepted');
  }

  async updateOrder(orderId: string, data: any) {
    const sanitizedData = JSON.parse(JSON.stringify({
      ...data,
      updatedAt: Date.now(),
    }));
    return db.collection("orders").doc(orderId).update(sanitizedData);
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    await db.collection("orders").doc(orderId).update({
      status,
      updatedAt: Date.now()
    });

    try {
        const orderDoc = await db.collection("orders").doc(orderId).get();
        const orderData = orderDoc.data() as Order;

        // Notify employer if worker changes status
        if (this.currentRole === 'worker' && orderData.employerId) {
            await notificationService.notifyStatusChange(orderId, orderData.employerId, status);
        } else if (this.currentRole === 'employer' && orderData.workerId) {
            // Notify worker if employer changes status (e.g. cancelled)
            await notificationService.notifyStatusChange(orderId, orderData.workerId, status);
        }
    } catch (e) {
        console.error("Error in updateStatus notification:", e);
    }
  }

  async deleteOrder(orderId: string) {
    return db.collection("orders").doc(orderId).delete();
  }

  async togglePin(orderId: string, currentPinStatus: boolean) {
    return db.collection("orders").doc(orderId).update({
      isPinned: !currentPinStatus,
      updatedAt: Date.now()
    });
  }
}

export const orderService = new OrderService();
export type { Order };
