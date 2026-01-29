// src/Navbar.js
import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import "./Navbar.css";

const db = getFirestore();

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [subStatus, setSubStatus] = useState("checking"); // checking | inactive | pending | active

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // Live subscription status listener (when logged in)
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
  const isActive = subStatus === "active";

  return (
    <nav className="nav-wrap">
      <div className="nav-inner">
        {/* Brand (left) */}
        <Link to="/" className="brand">
          AdGen MCM
        </Link>

        {/* Right side: tools + auth actions */}
        <div className="nav-right">
          {/* Only show tools if email verified AND subscription active */}
          {verified && isActive && (
            <>
              <NavLink to="/adgenerator" className="nav-link">
                Ad Generator
              </NavLink>
              <NavLink to="/texteditor" className="nav-link">
                Text Editor
              </NavLink>
            </>
          )}

          {user ? (
            <button className="btn primary" onClick={() => signOut(auth)}>
              Logout
            </button>
          ) : (
            <NavLink to="/login" className="btn primary">
              Login
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}






