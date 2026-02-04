import React, { useEffect, useState } from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { doc, onSnapshot, getFirestore } from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";

const db = getFirestore();

/** Auth + Active-subscription gate for paid features (admin bypass supported) */
export default function PaidRoute() {
  const { currentUser } = useAuth();
  const location = useLocation();

  const [status, setStatus] = useState("checking"); // checking | inactive | pending | active | trialing
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);

  // ✅ Check admin claim (role=admin)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!currentUser) {
        setIsAdmin(false);
        setClaimsChecked(true);
        return;
      }

      try {
        // Force refresh so newly-set custom claims appear
        const tokenResult = await getIdTokenResult(currentUser, true);
        if (!cancelled) {
          setIsAdmin(tokenResult?.claims?.role === "admin");
          setClaimsChecked(true);
        }
      } catch (e) {
        console.warn("[PaidRoute] Failed to read token claims:", e);
        if (!cancelled) {
          setIsAdmin(false);
          setClaimsChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Subscription listener (only matters for non-admins)
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

  // Wait until we know whether user is admin
  if (!claimsChecked) return null;

  // ✅ Admin bypasses paywall entirely
  if (isAdmin) return <Outlet />;

  // Existing logic unchanged for non-admins
  if (status === "checking") return null;

  const allowed = status === "active" || status === "trialing";
  if (!allowed) {
    return <Navigate to="/subscribe" replace state={{ from: location }} />;
  }

  return <Outlet />;
}




