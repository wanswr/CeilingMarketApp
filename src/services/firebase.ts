import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA1HKGrW583wARaj6wBvI1Bhh_QzOS2xwg",
  authDomain: "ceilingsapp.firebaseapp.com",
  projectId: "ceilingsapp",
  storageBucket: "ceilingsapp.firebasestorage.app",
  messagingSenderId: "121151171522",
  appId: "1:121151171522:web:29e48135e5b216c88f845b",
  measurementId: "G-2FC5M9L3D9"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
export default app;
