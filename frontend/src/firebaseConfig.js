// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

//Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAME45e-85ca3KcylGWNceT2WFd3Yn42ps",
  authDomain: "adgen-mcm---ad-generator.firebaseapp.com",
  projectId: "adgen-mcm---ad-generator",
  storageBucket: "adgen-mcm---ad-generator.firebasestorage.app",
  messagingSenderId: "340851760898",
  appId: "1:340851760898:web:0ed56b613a48fe36fbec1b",
  measurementId: "G-YM4NSQ126N"
};

export const app = initializeApp(firebaseConfig);

// Export ONE shared auth instance for the whole app
export const auth = getAuth(app);

// Persist login across tabs/redirects (important when returning from Stripe)
setPersistence(auth, browserLocalPersistence).catch(() => {});
