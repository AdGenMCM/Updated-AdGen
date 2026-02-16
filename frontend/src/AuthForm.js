// src/AuthForm.js
import "./AuthForm.css";
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "./firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";

import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const db = getFirestore();

/**
 * After a successful login, this navigates back to the EXACT route
 * saved by your guards (path + query), so /subscribe?session_id=... survives.
 */
const AuthForm = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ NEW: names for registration
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [unverifiedUser, setUnverifiedUser] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setUnverifiedUser(null);

    try {
      if (isRegistering) {
        // basic validation (optional)
        if (!firstName.trim() || !lastName.trim()) {
          setMessage("Please enter your first and last name.");
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, password);

        // ✅ Optional but nice: set displayName in Firebase Auth user profile
        await updateProfile(cred.user, {
          displayName: `${firstName.trim()} ${lastName.trim()}`,
        });

        // ✅ Create user profile doc in Firestore
        // NOTE: your PaidRoute/AuthProvider already read users/{uid} for stripe data
        // This will coexist with stripe fields (later you can add merge writes elsewhere as needed).
        await setDoc(
          doc(db, "users", cred.user.uid),
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: cred.user.email,
            createdAt: serverTimestamp(),

            // Optional defaults (safe to keep even if you don't use them yet)
            tier: "trial",
            subscriptionStatus: "inactive",
            monthlyUsage: 0,
          },
          { merge: true }
        );
        
        if (window.fbq) {
          window.fbq("track", "CompleteRegistration");
        }

        await sendEmailVerification(cred.user);
        setMessage(
          "Account created! Verification email sent. Please check your inbox."
        );
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        setUnverifiedUser(cred.user);
        setMessage("Please verify your email before logging in.");
        return;
      }

      if (typeof onLogin === "function") onLogin(cred.user);

      // Restore BOTH pathname and search saved by the guard
      const from = location.state?.from;
      if (from?.pathname) {
        navigate(from.pathname + (from.search || ""), { replace: true });
      } else {
        navigate("/adgenerator", { replace: true });
      }
    } catch (err) {
      setMessage(err.message || "Login failed.");
    }
  };

  const handlePasswordReset = async () => {
    if (!email) return setMessage("Enter your email to reset your password.");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleResendVerification = async () => {
    try {
      if (unverifiedUser) {
        await sendEmailVerification(unverifiedUser);
        setMessage("Verification email resent.");
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit}>
        <h2>{isRegistering ? "Register" : "Log In"}</h2>

        {/* ✅ NEW: show name fields only on Register */}
        {isRegistering && (
          <>
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              required
              onChange={(e) => setFirstName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              required
              onChange={(e) => setLastName(e.target.value)}
            />
          </>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">{isRegistering ? "Register" : "Log In"}</button>

        <button type="button" onClick={handlePasswordReset}>
          Forgot Password?
        </button>

        {unverifiedUser && (
          <button type="button" onClick={handleResendVerification}>
            Resend Verification Email
          </button>
        )}

        <p className="auth-toggle" onClick={() => setIsRegistering(!isRegistering)}>
          {isRegistering ? "Already have an account? Log in" : "Don't have an account? Register"}
        </p>

        {message && <p className="auth-message">{message}</p>}
      </form>
    </div>
  );
};

export default AuthForm;

//test upload to github






