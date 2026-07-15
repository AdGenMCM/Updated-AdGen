// src/AuthProvider.js
import React, { createContext, useEffect, useMemo, useState, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

const AuthContext = createContext(null);
const db = getFirestore();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);

  // ✅ NEW: full Firestore user document
  const [userDoc, setUserDoc] = useState(null);

  // existing stripe state (kept for PaidRoute)
  const [stripe, setStripe] = useState(null);

  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // -----------------------------
  // 1️⃣ Firebase Auth listener
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // -----------------------------------
  // 2️⃣ Firestore users/{uid} listener
  // -----------------------------------
  useEffect(() => {
    if (!currentUser) {
      setUserDoc(null);
      setStripe(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    const ref = doc(db, "users", currentUser.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() || null;

        // ✅ store entire user document
        setUserDoc(data);

        // ✅ keep stripe logic working
        setStripe(data?.stripe ?? null);
        setProfileLoading(false);
      },
      () => {
        setUserDoc(null);
        setStripe(null);
        setProfileLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // -----------------------------------
  // 3️⃣ Context value
  // -----------------------------------
  const value = useMemo(
    () => ({
      currentUser,
      stripe,
      userDoc,
      loading,
      profileLoading,
    }),
    [currentUser, stripe, userDoc, loading, profileLoading]
  );

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}




