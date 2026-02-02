// src/AuthProvider.js
import React, { createContext, useEffect, useMemo, useState, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

const AuthContext = createContext(null);
const db = getFirestore();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [stripe, setStripe] = useState(null); // users/{uid}.stripe
  const [loading, setLoading] = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Stripe (Firestore) listener
  useEffect(() => {
    if (!currentUser) {
      setStripe(null);
      return;
    }

    const ref = doc(db, "users", currentUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const s = snap.data()?.stripe ?? null;
        setStripe(s);
      },
      () => setStripe(null)
    );

    return () => unsub();
  }, [currentUser]);

  const value = useMemo(() => ({ currentUser, stripe }), [currentUser, stripe]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}


