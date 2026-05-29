import { db, auth } from './firebase';
import { Order, OrderStatus } from '../types';

class OrderService {
  private orders: Order[] = [];
  private listeners: { [key: string]: Function[] } = {};
  private currentRole: 'employer' | 'worker' = 'employer';

  constructor() {
    db.collection("orders").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
      this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Order));
      this.emit('ordersUpdated', this.orders);
    }, (err) => console.error("Firestore Error:", err));
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

  getCurrentRole() { return this.currentRole; }

  setRole(role: 'employer' | 'worker') {
    this.currentRole = role;
    this.emit('roleChanged', role);
  }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    return db.collection("orders").add({
      ...data,
      employerId: auth.currentUser.uid,
      status: 'new',
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
