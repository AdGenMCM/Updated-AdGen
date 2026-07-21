import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";
import { useAuth } from "./AuthProvider";

const db = getFirestore();

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Authentication + account-activation gate.
 *
 * /subscribe remains available to authenticated users who have not selected
 * a plan. Other routes wrapped by this guard require an activated Free or paid
 * plan. Admin users bypass the activation requirement.
 */
export default function ProtectedRoute() {
  const { currentUser } = useAuth();
  const location = useLocation();

  const [subscriptionStatus, setSubscriptionStatus] = useState("checking");
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);

  const isSubscribeRoute = location.pathname === "/subscribe";

  useEffect(() => {
    let cancelled = false;

    setClaimsChecked(false);
    setIsAdmin(false);

    if (!currentUser) {
      setClaimsChecked(true);
      return undefined;
    }

    (async () => {
      try {
        const tokenResult = await getIdTokenResult(currentUser, true);

        if (!cancelled) {
          setIsAdmin(tokenResult?.claims?.role === "admin");
        }
      } catch (error) {
        console.warn("[ProtectedRoute] Failed to read token claims:", error);

        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setClaimsChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    setSubscriptionStatus("checking");

    if (!currentUser) {
      setSubscriptionStatus("inactive");
      return undefined;
    }

    const userRef = doc(db, "users", currentUser.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        const nextStatus =
          data?.stripe?.status ||
          data?.subscriptionStatus ||
          "inactive";

        setSubscriptionStatus(nextStatus);
      },
      (error) => {
        console.error(
          "[ProtectedRoute] Failed to read account activation status:",
          error
        );
        setSubscriptionStatus("inactive");
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!currentUser.emailVerified) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Plan selection must remain reachable before account activation.
  if (isSubscribeRoute) {
    return <Outlet />;
  }

  if (!claimsChecked || subscriptionStatus === "checking") {
    return null;
  }

  const hasWorkspaceAccess =
    isAdmin || ACTIVE_STATUSES.has(subscriptionStatus);

  if (!hasWorkspaceAccess) {
    return (
      <Navigate
        to="/subscribe"
        replace
        state={{
          notice: "choose_plan",
          from: location,
        }}
      />
    );
  }

  return <Outlet />;
}

