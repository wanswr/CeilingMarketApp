import { collection, addDoc, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';

class OrderService {
  private orders: any[] = [];
  private listeners: any = {};

  constructor() {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
      this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.emit('ordersUpdated', this.orders);
    }, (err) => console.error("Firestore Error:", err));
  }

  on(event: string, cb: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) this.listeners[event].forEach((cb: any) => cb(data));
  }

  getOrders() { return [...this.orders]; }

  async createOrder(data: any) {
    if (!auth.currentUser) throw new Error("Не авторизован");
    return addDoc(collection(db, "orders"), {
      ...data,
      employerId: auth.currentUser.uid,
      status: 'pending',
      timestamp: Date.now()
    });
  }
}
export const orderService = new OrderService();