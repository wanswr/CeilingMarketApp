import { db, auth } from './firebase';
import { Order, OrderStatus } from '../types';

class OrderService {
  private orders: Order[] = [];
  private listeners: { [key: string]: Function[] } = {};
  private currentRole: 'employer' | 'worker' = 'employer';
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    auth.onAuthStateChanged((user) => {
      if (user) {
        if (this.unsubscribe) this.unsubscribe();

        // Use a timeout or a check to delay listening if user is still in registration
        // For now, we handle the error silently to avoid Red Box on the login/onboarding screen
        this.unsubscribe = db.collection("orders")
          .orderBy("timestamp", "desc")
          .onSnapshot((snapshot) => {
            this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Order));
            this.emit('ordersUpdated', this.orders);
          }, (err) => {
            if (err.code === 'permission-denied') {
              console.warn("Firestore: Waiting for permissions (profile registration in progress)");
            } else {
              console.error("Firestore Error:", err);
            }
          });
      } else {
        if (this.unsubscribe) {
          this.unsubscribe();
          this.unsubscribe = null;
        }
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

  setRole(role: 'employer' | 'worker') {
    this.currentRole = role;
    this.emit('roleChanged', role);
  }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    return db.collection("orders").add({
      ...data,
      employerId: auth.currentUser.uid,
      status: 'pending',
      timestamp: Date.now()
    });
  }

  async applyForOrder(orderId: string, workerId: string) {
    console.log(`Applying for order ${orderId} as ${workerId}`);
  }

  async confirmWorker(orderId: string, worker: any) {
    return db.collection("orders").doc(orderId).update({
      workerId: worker.id,
      status: 'accepted'
    });
  }

  async updateStatus(orderId: string, status: OrderStatus) {
    return db.collection("orders").doc(orderId).update({ status });
  }
}

export const orderService = new OrderService();
export type { Order };
