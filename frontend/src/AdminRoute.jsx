import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { getIdTokenResult } from "firebase/auth";

export default function AdminRoute() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(currentUser, true);
        if (!cancelled) {
          setIsAdmin(tokenResult?.claims?.role === "admin");
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Not logged in
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Still checking claims
  if (isAdmin === null) {
    return null; // or loading spinner
  }

  // Logged in but not admin
  if (!isAdmin) {
    return <Navigate to="/adgenerator" replace />;
  }

  // Admin
  return <Outlet />;
}
