import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-ignore
  getReactNativePersistence,
  getAuth,
  Auth
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyA1HKGrW583wARaj6wBvI1Bhh_QzOS2xwg",
  authDomain: "ceilingsapp.firebaseapp.com",
  projectId: "ceilingsapp",
  storageBucket: "ceilingsapp.firebasestorage.app",
  messagingSenderId: "121151171522",
  appId: "1:121151171522:web:29e48135e5b216c88f845b",
  measurementId: "G-2FC5M9L3D9"
};

let app: FirebaseApp;
let auth: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  // Fallback if already initialized or registration issue
  auth = getAuth(app);
}

const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { auth, db, storage };
export default app;
