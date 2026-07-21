import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  Home,
  Layers3,
  CircleDollarSign,
  Building2,
  Mail,
  FileText,
  ShieldCheck,
  UserRound,
  LogOut,
  Settings,
} from "lucide-react";
import {
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
} from "firebase/auth";
import { auth } from "./firebaseConfig";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import "./Navbar.css";

import { trackEvent } from "./analytics/tracking";

const db = getFirestore();

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [subStatus, setSubStatus] = useState("checking");
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const moreRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(nextUser, true);
        setIsAdmin(tokenResult?.claims?.role === "admin");
      } catch (error) {
        console.warn("[Navbar] Failed to read token claims:", error);
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setSubStatus("inactive");
      return undefined;
    }

    const ref = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data();

        const nextStatus =
          data?.stripe?.status ||
          data?.subscriptionStatus ||
          "inactive";

        setSubStatus(nextStatus);
      },
      () => setSubStatus("inactive")
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }

      if (!accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setMoreOpen(false);
        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const verified = Boolean(user?.emailVerified);
  const hasActiveAccess =
    subStatus === "active" ||
    subStatus === "trialing" ||
    subStatus === "past_due";

  const canAccessWorkspace =
    Boolean(user) && (isAdmin || (verified && hasActiveAccess));

  const primaryLinks = [
    { to: "/", label: "Home" },
    { to: "/platform", label: "Platform" },
    { to: "/pricing", label: "Pricing" },
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" },
  ];

  const utilityLinks = [
    { to: "/terms", label: "Terms of Service", icon: FileText },
    { to: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
  ];

  const mobileLinks = [
    { to: "/", label: "Home", icon: Home },
    { to: "/platform", label: "Platform", icon: Layers3 },
    { to: "/pricing", label: "Pricing", icon: CircleDollarSign },
    { to: "/about", label: "About", icon: Building2 },
    { to: "/contact", label: "Contact", icon: Mail },
    ...utilityLinks,
  ];

  const closeAll = () => {
    setMobileOpen(false);
    setMoreOpen(false);
    setAccountOpen(false);
  };

  return (
    <nav className="marketing-nav">
      <div className="marketing-nav-inner">
        <Link to="/" className="marketing-nav-brand" onClick={closeAll}>
          <img
            src="/images/ADGen MCM Logo Update Transparent copy.png"
            alt="ADGen MCM"
            className="marketing-nav-brand-logo"
          />
        </Link>

        <div className="marketing-nav-center" aria-label="Primary navigation">
          {primaryLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `marketing-nav-link ${isActive ? "is-active" : ""}`
              }
            >
              {label}
            </NavLink>
          ))}

          <div className="marketing-nav-more" ref={moreRef}>
            <button
              type="button"
              className={`marketing-nav-link marketing-nav-more-toggle ${
                moreOpen ? "is-active" : ""
              }`}
              onClick={() => {
                setMoreOpen((open) => !open);
                setAccountOpen(false);
              }}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              Legal
              <ChevronDown size={14} />
            </button>

            {moreOpen && (
              <div className="marketing-nav-more-menu" role="menu">
                {utilityLinks.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={closeAll}
                    role="menuitem"
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="marketing-nav-actions">
          {user && verified ? (
            <>
              <Link
                to={canAccessWorkspace ? "/dashboard" : "/subscribe"}
                className="marketing-nav-workspace"
              >
                {canAccessWorkspace ? "Open workspace" : "Choose a plan"}
              </Link>

              <div className="marketing-nav-account" ref={accountRef}>
                <button
                  type="button"
                  className="marketing-nav-account-toggle"
                  onClick={() => {
                    setAccountOpen((open) => !open);
                    setMoreOpen(false);
                  }}
                  aria-label="Open account menu"
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                >
                  <span className="marketing-nav-avatar">
                    {(user.displayName || user.email || "U")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {accountOpen && (
                  <div className="marketing-nav-account-menu" role="menu">
                    <div className="marketing-nav-user">
                      <span>{user.displayName || "AdGen user"}</span>
                      <small>{user.email}</small>
                    </div>

                    <Link to="/account" onClick={closeAll} role="menuitem">
                      <UserRound size={16} />
                      My Account
                    </Link>

                    {isAdmin && (
                      <Link
                        to="/admin/users"
                        onClick={closeAll}
                        role="menuitem"
                      >
                        <Settings size={16} />
                        Admin
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        closeAll();
                        signOut(auth);
                      }}
                      role="menuitem"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="marketing-nav-login">
                Sign in
              </Link>
              <Link
                to="/login"
                className="marketing-nav-primary"
                onClick={() =>
                  trackEvent("start_free_click", {
                    location: "navbar_desktop",
                  })
                }
              >
                Start creating
              </Link>
            </>
          )}

          <button
            type="button"
            className="marketing-nav-mobile-toggle"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="marketing-nav-mobile-panel">
          <div className="marketing-nav-mobile-links">
            {mobileLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={closeAll}
                className={({ isActive }) =>
                  isActive ? "is-active" : ""
                }
              >
                <Icon size={17} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>

          <div className="marketing-nav-mobile-actions">
            {user && verified ? (
              <>
                <Link
                  to={canAccessWorkspace ? "/dashboard" : "/subscribe"}
                  onClick={closeAll}
                  className="is-primary"
                >
                  {canAccessWorkspace ? "Open workspace" : "Choose a plan"}
                </Link>

                <Link to="/account" onClick={closeAll}>
                  My Account
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    closeAll();
                    signOut(auth);
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={closeAll}>
                  Sign in
                </Link>
                <Link
                  to="/login"
                  className="marketing-nav-primary"
                  onClick={() =>
                    trackEvent("start_free_click", {
                      location: "navbar_desktop",
                    })
                  }
                >
                  Start creating
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}













