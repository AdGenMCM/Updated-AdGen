import React, { useEffect, useState } from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { doc, onSnapshot, getFirestore } from "firebase/firestore";

const db = getFirestore();

/** Auth + Active-subscription gate for paid features */
export default function PaidRoute() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState("checking"); // checking | inactive | pending | active

  // Hooks first (avoid "Rendered fewer hooks than expected")
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
    // preserve full path + query so we can return here after login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "checking") return null; // or a loader/spinner

  if (status !== "active") {
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  // ⬇️ With nested routes, render the matched child via <Outlet />
  return <Outlet />;
}



