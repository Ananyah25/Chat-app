import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "", // Replace with your actual API Key
  authDomain: "", // Replace with your actual Auth Domain
  projectId: "-", // Replace with your actual Project ID
  storageBucket: "", // Replace with your actual Storage Bucket (usually ends with .appspot.com)
  messagingSenderId: "", // Replace with your actual Messaging Sender ID
  appId: "" // Replace with your actual App ID
};

// Canvas-specific globals and local fallbacks with proper checks
export const appId = (typeof window !== 'undefined' && window.__app_id) || 'local-default-app-id';
export const initialAuthToken = (typeof window !== 'undefined' && window.__initial_auth_token) || null;

// Use canvas config if available, otherwise use default config
let canvasFirebaseConfig = firebaseConfig;
if (typeof window !== 'undefined' && window.__firebase_config) {
  try {
    canvasFirebaseConfig = JSON.parse(window.__firebase_config);
  } catch (error) {
    console.warn('Failed to parse canvas firebase config, using default:', error);
    canvasFirebaseConfig = firebaseConfig;
  }
}

// Initialize Firebase
const app = initializeApp(canvasFirebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Initialize messaging with error handling
let messaging = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.warn('Firebase Messaging not supported:', error);
}

// Export Firebase services and messaging functions
export { app, auth, db, storage, messaging, getToken, onMessage };