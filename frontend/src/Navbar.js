import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { signOut, onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import "./Navbar.css";

const db = getFirestore();

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [subStatus, setSubStatus] = useState("checking"); // checking | inactive | pending | active | trialing
  const [isAdmin, setIsAdmin] = useState(false);

  // Dropdown state
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef(null);

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setIsAdmin(false);
        return;
      }

      try {
        // Force refresh so updated custom claims show up
        const tokenResult = await getIdTokenResult(u, true);
        setIsAdmin(tokenResult?.claims?.role === "admin");
      } catch (e) {
        console.warn("[Navbar] Failed to read token claims:", e);
        setIsAdmin(false);
      }
    });

    return () => unsub();
  }, []);

  // Subscription status listener
  useEffect(() => {
    if (!user) {
      setSubStatus("inactive");
      return;
    }

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const s = snap.data()?.stripe?.status ?? "inactive";
        setSubStatus(s);
      },
      () => setSubStatus("inactive")
    );

    return () => unsub();
  }, [user]);

  const verified = !!user && user.emailVerified;
  const isActive = subStatus === "active" || subStatus === "trialing";

  // ✅ Admin should see everything regardless of subscription / verification
  const canAccessPaid = !!user && (isAdmin || (verified && isActive));

  // Close dropdown on outside click + Escape
  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!infoRef.current) return;
      if (!infoRef.current.contains(e.target)) setInfoOpen(false);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") setInfoOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Dropdown items (routes that exist)
  const dropdownItems = [
    { to: "/", label: "Home" },
    { to: "/about", label: "About" },
    { to: "/pricing", label: "Products & Pricing" },
    { to: "/contact", label: "Contact Us" },

    ...(user
      ? [
          { divider: true },
          { to: "/account", label: "My Account" },
        ]
      : []),

    { divider: true },
    { to: "/terms", label: "Terms of Service" },
    { to: "/privacy", label: "Privacy Policy" },
  ];

  return (
    <nav className="nav-wrap">
      <div className="nav-inner">
        {/* Brand left */}
        <Link to="/" className="brand" onClick={() => setInfoOpen(false)}>
          ADGen MCM
        </Link>

        {/* Right side */}
        <div className="nav-right">
          {/* FAR RIGHT DROPDOWN */}
          <div className="nav-dropdown" ref={infoRef}>
            <button
              className="dropdown-toggle"
              onClick={() => setInfoOpen((v) => !v)}
              aria-label="Open menu"
              aria-haspopup="menu"
              aria-expanded={infoOpen}
              type="button"
            >
              ☰
            </button>

            {infoOpen && (
              <div className="dropdown-menu dropdown-menu-right" role="menu">
                {dropdownItems.map((item, idx) => {
                  if (item.divider) {
                    return <div className="dropdown-divider" key={`div-${idx}`} />;
                  }
                  return (
                    <Link
                      key={`${item.to}-${idx}`}
                      to={item.to}
                      className="dropdown-item"
                      role="menuitem"
                      onClick={() => setInfoOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paid features links */}
          {canAccessPaid && (
            <>
              <NavLink
                to="/adgenerator"
                className="nav-link"
                onClick={() => setInfoOpen(false)}
              >
                Ad Generator
              </NavLink>
              <NavLink
                to="/texteditor"
                className="nav-link"
                onClick={() => setInfoOpen(false)}
              >
                Text Editor
              </NavLink>
            </>
          )}

          {/* Auth button */}
          {user ? (
            <button
              className="btn primary"
              onClick={() => {
                setInfoOpen(false);
                signOut(auth);
              }}
            >
              Logout
            </button>
          ) : (
            <NavLink
              to="/login"
              className="btn primary"
              onClick={() => setInfoOpen(false)}
            >
              Login
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}









