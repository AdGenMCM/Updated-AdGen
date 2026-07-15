// src/AuthForm.js
import "./AuthForm.css";
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "./firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  getIdTokenResult,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ArrowRight, Check, Eye, EyeOff, Image, Video, Palette, BarChart3 } from "lucide-react";

const db = getFirestore();
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

const productBenefits = [
  { icon: Palette, title: "Build around your brand", text: "Keep identity, voice, colors, fonts, and creative direction connected." },
  { icon: Image, title: "Create campaign-ready assets", text: "Generate images, copy, and variations from one focused workflow." },
  { icon: Video, title: "Bring ideas into motion", text: "Create short-form video from prompts or existing creative." },
  { icon: BarChart3, title: "Improve with real context", text: "Organize, track, and refine creative as campaigns evolve." },
];

export default function AuthForm({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [unverifiedUser, setUnverifiedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const showMessage = (text, type = "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const clearFeedback = () => {
    setMessage("");
    setUnverifiedUser(null);
  };



  const createWelcomeNotification = async (user) => {
    if (!user?.uid) return;

    const notificationRef = doc(
      db,
      "users",
      user.uid,
      "notifications",
      "welcome"
    );

    const existingNotification = await getDoc(notificationRef);

    if (existingNotification.exists()) {
      return;
    }

    await setDoc(notificationRef, {
      eventKey: "welcome",
      title: "Welcome to ADGen MCM",
      body:
        "Your creative workspace is ready. Start by building your Brand Kit, then create your first campaign-ready asset.",
      type: "welcome",
      link: "/brand-kit",
      read: false,
      createdAt: serverTimestamp(),
      metadata: {
        source: "account_creation",
      },
    });
  };

  const continueAfterAuthentication = async (user) => {
    if (typeof onLogin === "function") onLogin(user);

    const from = location.state?.from;

    try {
      const [userSnapshot, tokenResult] = await Promise.all([
        getDoc(doc(db, "users", user.uid)),
        getIdTokenResult(user),
      ]);

      const userData = userSnapshot.exists() ? userSnapshot.data() : {};
      const subscriptionStatus =
        userData?.stripe?.status ||
        userData?.subscriptionStatus ||
        "inactive";

      const isAdmin = tokenResult?.claims?.role === "admin";
      const hasWorkspaceAccess =
        isAdmin ||
        subscriptionStatus === "active" ||
        subscriptionStatus === "trialing" ||
        subscriptionStatus === "past_due";

      if (!hasWorkspaceAccess) {
        navigate("/subscribe", {
          replace: true,
          state: {
            notice: "choose_plan",
            from,
          },
        });
        return;
      }

      if (from?.pathname && from.pathname !== "/subscribe") {
        navigate(from.pathname + (from.search || ""), { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      console.error("Unable to resolve post-auth destination:", error);

      navigate("/subscribe", {
        replace: true,
        state: {
          notice: "choose_plan",
          from,
        },
      });
    }
  };

  const ensureGoogleUserProfile = async (user) => {
    const userRef = doc(db, "users", user.uid);
    const existingSnapshot = await getDoc(userRef);
    const isNewUser = !existingSnapshot.exists();

    const displayName = (user.displayName || "").trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const first = nameParts[0] || "";
    const last = nameParts.slice(1).join(" ");

    const profileData = {
      firstName: first,
      lastName: last,
      email: user.email || "",
      displayName,
      photoURL: user.photoURL || "",
      authProvider: "google",
      updatedAt: serverTimestamp(),
    };

    if (isNewUser) {
      Object.assign(profileData, {
        createdAt: serverTimestamp(),
        tier: "trial",
        subscriptionStatus: "inactive",
        monthlyUsage: 0,
      });
    }

    await setDoc(userRef, profileData, { merge: true });

    return isNewUser;
  };

  const handleGoogleSignIn = async () => {
    clearFeedback();
    setGoogleLoading(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const user = credential.user;

      const isNewUser = await ensureGoogleUserProfile(user);

      if (isNewUser) {
        await createWelcomeNotification(user);
      }

      if (window.fbq && credential?._tokenResponse?.isNewUser) {
        window.fbq("track", "CompleteRegistration");
      }

      await continueAfterAuthentication(user);
    } catch (error) {
      const code = error?.code || "";

      if (code.includes("popup-closed-by-user")) {
        showMessage("Google sign-in was closed before it finished.");
      } else if (code.includes("popup-blocked")) {
        showMessage("Your browser blocked the Google sign-in window. Allow popups and try again.");
      } else if (code.includes("account-exists-with-different-credential")) {
        showMessage(
          "An account already exists for this email using a different sign-in method."
        );
      } else {
        showMessage(error?.message || "We could not sign you in with Google.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);

    try {
      if (isRegistering) {
        if (!firstName.trim() || !lastName.trim()) {
          showMessage("Please enter your first and last name.");
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

        await updateProfile(credential.user, {
          displayName: `${firstName.trim()} ${lastName.trim()}`,
        });

        await setDoc(
          doc(db, "users", credential.user.uid),
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: credential.user.email,
            createdAt: serverTimestamp(),
            tier: "trial",
            subscriptionStatus: "inactive",
            monthlyUsage: 0,
          },
          { merge: true }
        );

        await createWelcomeNotification(credential.user);

        if (window.fbq) window.fbq("track", "CompleteRegistration");

        await sendEmailVerification(credential.user);
        showMessage(
          "Your account is ready. Check your inbox to verify your email before signing in.",
          "success"
        );
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

      if (!credential.user.emailVerified) {
        setUnverifiedUser(credential.user);
        showMessage("Please verify your email before signing in.");
        return;
      }

      await continueAfterAuthentication(credential.user);
    } catch (error) {
      const code = error?.code || "";

      if (code.includes("email-already-in-use")) {
        showMessage("An account already exists for this email.");
      } else if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found")
      ) {
        showMessage("The email or password you entered is incorrect.");
      } else if (code.includes("weak-password")) {
        showMessage("Use a stronger password with at least 6 characters.");
      } else if (code.includes("invalid-email")) {
        showMessage("Enter a valid email address.");
      } else {
        showMessage(error?.message || "We could not complete that request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      showMessage("Enter your email first so we know where to send the reset link.");
      return;
    }

    try {
      setResetting(true);
      await sendPasswordResetEmail(auth, email.trim());
      showMessage("Password reset email sent. Check your inbox.", "success");
    } catch (error) {
      showMessage(error?.message || "We could not send the reset email.");
    } finally {
      setResetting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;

    try {
      await sendEmailVerification(unverifiedUser);
      showMessage("Verification email resent. Check your inbox.", "success");
    } catch (error) {
      showMessage(error?.message || "We could not resend the verification email.");
    }
  };

  const toggleMode = () => {
    setIsRegistering((current) => !current);
    setMessage("");
    setUnverifiedUser(null);
    setPassword("");
  };

  return (
    <main className="auth-v2-page">
      <section className="auth-v2-story">
        <div className="auth-v2-story-light" aria-hidden="true" />

        <div className="auth-v2-story-inner">
          <Link to="/" className="auth-v2-brand">
            <span>
               <img
                src="/images/ADGen MCM Logo Update Transparent Copy.png"
                alt="ADGen MCM"
                className="marketing-nav-brand-logo"
              />
            </span>
          </Link>

          <div className="auth-v2-story-copy">
            <span className="auth-v2-eyebrow">
              {isRegistering ? "Start your workspace" : "Welcome back"}
            </span>
            <h1>
              {isRegistering
                ? "Build better creative from one connected workspace."
                : "Your creative workflow is ready when you are."}
            </h1>
            <p>
              Bring your brand, image generation, video, editing, optimization,
              organization, and performance context into one platform.
            </p>
          </div>

          <div className="auth-v2-benefits">
            {productBenefits.map(({ icon: Icon, title, text }) => (
              <div className="auth-v2-benefit" key={title}>
                <span className="auth-v2-benefit-icon"><Icon size={18} /></span>
                <div><h2>{title}</h2><p>{text}</p></div>
              </div>
            ))}
          </div>

          <div className="auth-v2-story-proof">
            <span><Check size={14} /> Secure account access</span>
            <span><Check size={14} /> Premium creative workspace</span>
            <span><Check size={14} /> Cancel anytime</span>
          </div>
        </div>
      </section>

      <section className="auth-v2-form-section">
        <div className="auth-v2-form-wrap">
          <div className="auth-v2-form-head">
            <span className="auth-v2-form-kicker">
              {isRegistering ? "Create account" : "Account access"}
            </span>
            <h2>{isRegistering ? "Start with ADGen" : "Sign in to ADGen"}</h2>
            <p>
              {isRegistering
                ? "Create your account, verify your email, and choose the plan that fits your workflow."
                : "Enter your details to continue into your creative workspace."}
            </p>
          </div>

          <button
            type="button"
            className="auth-v2-google"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || submitting}
          >
            <span className="auth-v2-google-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.23-.2-1.77H12v3.41h5.52a4.73 4.73 0 0 1-2.05 3.02l-.02.11 2.98 2.31.21.02c1.93-1.78 2.96-4.4 2.96-7.1Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.97-.89 6.63-2.42l-3.16-2.44c-.85.58-1.99.99-3.47.99a6.02 6.02 0 0 1-5.69-4.17l-.1.01-3.1 2.4-.03.1A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.31 13.96A6.17 6.17 0 0 1 6 12c0-.68.11-1.34.3-1.96l-.01-.13-3.14-2.44-.1.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.48l3.23-2.52Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.87c1.87 0 3.13.81 3.85 1.48l2.84-2.77C16.95 2.96 14.7 2 12 2a10 10 0 0 0-8.95 5.52l3.25 2.52A6.03 6.03 0 0 1 12 5.87Z"
                />
              </svg>
            </span>

            <span>
              {googleLoading
                ? "Connecting to Google…"
                : isRegistering
                ? "Continue with Google"
                : "Sign in with Google"}
            </span>
          </button>

          <div className="auth-v2-divider auth-v2-provider-divider">
            <span />
            <p>or continue with email</p>
            <span />
          </div>

          <form className="auth-v2-form" onSubmit={handleSubmit}>
            {isRegistering && (
              <div className="auth-v2-name-grid">
                <label className="auth-v2-field">
                  <span>First name</span>
                  <input type="text" value={firstName} onChange={(e) => { setFirstName(e.target.value); clearFeedback(); }} placeholder="First name" autoComplete="given-name" disabled={submitting || googleLoading} required />
                </label>
                <label className="auth-v2-field">
                  <span>Last name</span>
                  <input type="text" value={lastName} onChange={(e) => { setLastName(e.target.value); clearFeedback(); }} placeholder="Last name" autoComplete="family-name" disabled={submitting || googleLoading} required />
                </label>
              </div>
            )}

            <label className="auth-v2-field">
              <span>Email address</span>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearFeedback(); }} placeholder="you@example.com" autoComplete="email" disabled={submitting || googleLoading} required />
            </label>

            <label className="auth-v2-field">
              <span>Password</span>
              <div className="auth-v2-password">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); clearFeedback(); }} placeholder={isRegistering ? "Create a password" : "Enter your password"} autoComplete={isRegistering ? "new-password" : "current-password"} disabled={submitting || googleLoading} minLength={6} required />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} className="auth-v2-password-toggle">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isRegistering && <small>Use at least 6 characters.</small>}
            </label>

            {!isRegistering && (
              <button type="button" className="auth-v2-text-button auth-v2-forgot" onClick={handlePasswordReset} disabled={resetting || submitting}>
                {resetting ? "Sending reset email…" : "Forgot your password?"}
              </button>
            )}

            <button type="submit" className="auth-v2-submit" disabled={submitting || googleLoading}>
              <span>{submitting ? (isRegistering ? "Creating account…" : "Signing in…") : (isRegistering ? "Create account" : "Continue")}</span>
              {!submitting && <ArrowRight size={18} />}
            </button>

            {message && (
              <div className={`auth-v2-message ${messageType === "success" ? "is-success" : "is-error"}`} role="status" aria-live="polite">
                <span>{messageType === "success" ? "✓" : "!"}</span>
                <p>{message}</p>
              </div>
            )}

            {unverifiedUser && (
              <button type="button" className="auth-v2-secondary-action" onClick={handleResendVerification}>
                Resend verification email
              </button>
            )}

            <div className="auth-v2-divider"><span /><p>{isRegistering ? "Already registered?" : "New to ADGen?"}</p><span /></div>

            <button type="button" className="auth-v2-mode-switch" onClick={toggleMode} disabled={submitting || googleLoading}>
              {isRegistering ? "Sign in to your account" : "Create an ADGen account"}
            </button>
          </form>

          <p className="auth-v2-legal">
            By continuing, you agree to the <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}










