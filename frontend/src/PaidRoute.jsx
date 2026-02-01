import React, { useEffect, useState } from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { doc, onSnapshot, getFirestore } from "firebase/firestore";

const db = getFirestore();

/** Auth + Active-subscription gate for paid features */
export default function PaidRoute() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState("checking"); // checking | inactive | pending | active | trialing

  useEffect(() => {
    if (!currentUser) return;
    const ref = doc(db, "users", currentUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const s = snap.data()?.stripe?.status ?? "inactive";
      setStatus(s);
    });
    return () => unsub && unsub();
  }, [currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "checking") return null;

  const allowed = status === "active" || status === "trialing";
  if (!allowed) {
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  return <Outlet />;
}




