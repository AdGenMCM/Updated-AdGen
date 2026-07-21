// src/pages/Subscribe.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../AuthProvider";
import {
  doc,
  onSnapshot,
  getFirestore,
  updateDoc,
  deleteField
} from "firebase/firestore";
import {
  createCheckoutSession,
  createPortalSession,
  syncSubscription,
} from "../api/payments";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import "./Subscribe.css";

import { trackEvent } from "../analytics/tracking";

const db = getFirestore();

const PLAN_OPTIONS = [
  {
    id: "free",
    label: "Free",
    price: 0,
    eyebrow: "Get started",
    description:
      "Try AdGen MCM before upgrading.",
    images: "2 lifetime images",
    videos: "No video",
    optimizer: "No Optimizer",
    brands: "No Brand Kit",
    storage: "250 MB storage",
    features: [
      "Image generation",
      "Dashboard",
      "My Account",
    ],
  },
  {
    id: "trial_monthly",
    label: "Trial",
    price: 9.99,
    eyebrow: "Explore AdGen",
    description:
      "Experience the connected creative workflow with real image and video generation.",
    images: "10 images",
    videos: "2 video credits",
    optimizer: "No Optimizer",
    brands: "1 Brand Kit",
    storage: "2 GB storage",
    features: [
      "Image generation",
      "Video generation",
      "Ad copy",
      "Creative Studio",
      "Creative Library",
    ],
  },
  {
    id: "starter_monthly",
    label: "Starter",
    price: 34.99,
    eyebrow: "For growing creators",
    description:
      "A dependable monthly creative workflow for freelancers, brands, and small businesses.",
    images: "40 images",
    videos: "5 video credits",
    optimizer: "No Optimizer",
    brands: "1 Brand Kit",
    storage: "10 GB storage",
    features: [
      "Everything in Trial",
      "Higher generation limits",
      "Brand-aware defaults",
      "Creative Studio",
      "Asset storage",
    ],
  },
  {
    id: "pro_monthly",
    label: "Pro",
    price: 79.99,
    eyebrow: "Most popular",
    description:
      "Create, optimize, measure, and improve active campaigns from one connected workspace.",
    images: "100 images",
    videos: "12 video credits",
    optimizer: "20 Optimizer runs",
    brands: "3 Brand Kits",
    storage: "50 GB storage",
    featured: true,
    features: [
      "Everything in Starter",
      "Creative Optimizer",
      "Performance tracking",
      "Winner analysis",
      "Advanced Insights",
    ],
  },
  {
    id: "business_monthly",
    label: "Business",
    price: 199.99,
    eyebrow: "For teams and agencies",
    description:
      "Higher limits and multi-brand capacity for high-volume creative workflows.",
    images: "250 images",
    videos: "30 video credits",
    optimizer: "75 Optimizer runs",
    brands: "10 Brand Kits",
    storage: "200 GB storage",
    features: [
      "Everything in Pro",
      "Priority generation",
      "Expanded storage",
      "Higher optimizer limits",
      "Priority support",
    ],
  },
];

const ALLOWED_TIERS = new Set(PLAN_OPTIONS.map((plan) => plan.id));

export default function Subscribe() {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState("checking");
  const [stripeInfo, setStripeInfo] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tier, setTier] = useState("free");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutAbandoned, setCheckoutAbandoned] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const sessionId = params.get("session_id");
  const success = params.get("success") === "1";
  const upgradeMode = params.get("upgrade") === "1";
  const canceled = params.get("canceled") === "1";
  const from = location.state?.from?.pathname || "/dashboard";
  const pollRef = useRef(null);
  const purchaseFiredRef = useRef(false);
  const notice = location.state?.notice || params.get("notice") || "";
  const activationMessage =
    notice === "choose_plan"
      ? "Choose a plan to activate your AdGen workspace."
      : "";

  const selectedPlan =
    PLAN_OPTIONS.find((plan) => plan.id === tier) || PLAN_OPTIONS[1];

  useEffect(() => {
    const requestedTier = (params.get("tier") || "").trim();

    if (requestedTier && ALLOWED_TIERS.has(requestedTier)) {
      setTier(requestedTier);
    }
  }, [params]);

  useEffect(() => {
    const sid = params.get("session_id");

    if (!currentUser && sid) {
      localStorage.setItem("pending_session_id", sid);
    }
  }, [currentUser, params]);

  useEffect(() => {
    if (!currentUser) return;

    const sid = localStorage.getItem("pending_session_id");

    if (!sid) return;

    (async () => {
      try {
        await syncSubscription({
          uid: currentUser.uid,
          sessionId: sid,
        });
      } finally {
        localStorage.removeItem("pending_session_id");
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !success || !sessionId) return;

    (async () => {
      try {
        setSyncing(true);

        await syncSubscription({
          uid: currentUser.uid,
          sessionId,
        });
      } catch (syncError) {
        console.error("sync-subscription (initial) failed:", syncError);
      } finally {
        setSyncing(false);
      }
    })();
  }, [currentUser, success, sessionId]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const ref = doc(db, "users", currentUser.uid);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data();
        const nextStatus =
          data?.stripe?.status ||
          data?.subscriptionStatus ||
          "inactive";

        setStatus(nextStatus);
        setStripeInfo(data?.stripe || null);

        const hasWorkspaceAccess =
          nextStatus === "active" ||
          nextStatus === "trialing" ||
          nextStatus === "past_due";

        if (hasWorkspaceAccess) {
          const storedTarget = localStorage.getItem(
            "adgen_post_checkout_redirect"
          );

          const completedCheckout =
            Boolean(success && sessionId) ||
            Boolean(storedTarget);

          const confirmedTier =
            data?.stripe?.tier ||
            data?.tier ||
            null;

          const confirmedPlan = confirmedTier
            ? PLAN_OPTIONS.find((plan) => plan.id === confirmedTier)
            : null;

          const paidCheckoutConfirmed =
            completedCheckout &&
            confirmedPlan &&
            confirmedPlan.id !== "free";

          if (!purchaseFiredRef.current && paidCheckoutConfirmed) {
            purchaseFiredRef.current = true;

            trackEvent("subscription_started", {
              plan: confirmedPlan.id,
              plan_name: confirmedPlan.label,
              value: confirmedPlan.price,
              currency: "USD",
            });
          }

          if (paidCheckoutConfirmed) {
            const destination = storedTarget || "/brand-kit";

            localStorage.removeItem("adgen_post_checkout_redirect");

            navigate(destination, { replace: true });
            return;
          }

          if (!upgradeMode && !completedCheckout) {
            navigate(from || "/dashboard", { replace: true });
          }
        }
      },
      (snapshotError) => {
        console.error("Firestore onSnapshot error:", snapshotError);
        setError("Unable to read subscription status. Please refresh.");
        setStatus("inactive");
      }
    );

    return () => unsubscribe && unsubscribe();
  }, [
    currentUser,
    navigate,
    from,
    success,
    sessionId,
    upgradeMode,
  ]);

  useEffect(() => {
    if (!currentUser || !sessionId || status !== "pending") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      return undefined;
    }

    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;

      try {
        await syncSubscription({
          uid: currentUser.uid,
          sessionId,
        });
      } catch {
        // Keep polling briefly while Stripe and Firestore finish syncing.
      }

      if (attempts >= 10 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [currentUser, sessionId, status]);




  const openInNewTab = (url) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const clearAbandonedCheckout = useCallback(async () => {
    if (!currentUser) return;

    // Only clean an unfinished checkout.
    if (stripeInfo?.status !== "pending") return;

    // Do not remove information from a previously confirmed paid plan.
    if (stripeInfo?.tier) return;

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        "stripe.status": deleteField(),
        "stripe.requestedTier": deleteField(),
      });
    } catch (cleanupError) {
      console.error("Failed to clear abandoned checkout:", cleanupError);
    }
  }, [currentUser, stripeInfo?.status, stripeInfo?.tier]);

  useEffect(() => {
  const handleWindowFocus = () => {
    if (status !== "pending" || success || sessionId) return;

    window.setTimeout(() => {
      setCheckoutAbandoned(true);
      setSyncing(false);
      localStorage.removeItem("adgen_post_checkout_redirect");
      void clearAbandonedCheckout();
    }, 500);
  };

  window.addEventListener("focus", handleWindowFocus);

  return () => {
    window.removeEventListener("focus", handleWindowFocus);
  };
}, [
  status,
  success,
  sessionId,
  clearAbandonedCheckout,
]);

    useEffect(() => {
    if (!canceled) return;

    void clearAbandonedCheckout();
  }, [canceled, clearAbandonedCheckout]);

  const activateFreePlan = async () => {
    if (!currentUser) return;

    try {
      await updateDoc(
        doc(db, "users", currentUser.uid),
        {
          tier: "free",
          subscriptionStatus: "active",
        }
      );

      trackEvent("free_plan_activated", {
        plan: "free",
      });

      navigate("/dashboard", {
        replace: true,
      });
    } catch (err) {
      console.error(err);
      setError("Failed to activate Free plan.");
    }
  };

  const startSubscription = async () => {
    if (!currentUser) {
      navigate("/login", {
        state: {
          from: {
            pathname: "/subscribe",
            search: `?tier=${tier}`,
          },
        },
      });
      return;
    }

    setError("");
    setCheckoutAbandoned(false);
    setCheckoutLoading(true);

    try {
      localStorage.setItem(
        "adgen_post_checkout_redirect",
        "/brand-kit"
      );

      const { url } = await createCheckoutSession({
        uid: currentUser.uid,
        email: currentUser.email,
        tier,
      });

      openInNewTab(url);
    } catch (checkoutError) {
      console.error(checkoutError);
      localStorage.removeItem("adgen_post_checkout_redirect");
      setError(checkoutError.message || "Failed to start checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openBilling = async () => {
    setError("");

    try {
      if (!stripeInfo?.customerId) {
        setError("No Stripe customer is on file yet. Please subscribe first.");
        return;
      }

      const { url } = await createPortalSession(stripeInfo.customerId);
      openInNewTab(url);
    } catch (portalError) {
      console.error(portalError);
      setError(portalError.message || "Failed to open billing portal.");
    }
  };

  const manualRefresh = async () => {
    if (!currentUser || !sessionId) return;

    try {
      setSyncing(true);

      await syncSubscription({
        uid: currentUser.uid,
        sessionId,
      });
    } catch {
      setError("Refresh failed. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  };

  const pendingCheckoutIsReturning =
    status === "pending" && Boolean(success && sessionId);

  const showSpinner =
    status === "checking" ||
    syncing ||
    (pendingCheckoutIsReturning && !checkoutAbandoned);

  const isActive =
    status === "active" ||
    status === "trialing" ||
    status === "past_due";

  if (!currentUser) {
    return (
      <main className="subscribe-v2-page">
        <section className="subscribe-v2-signin">
          <div className="subscribe-v2-signin-card">
            <span className="subscribe-v2-eyebrow">Account required</span>
            <h1>Sign in to choose your plan.</h1>
            <p>
              Create an account or sign in before continuing to secure Stripe
              checkout.
            </p>
            <button type="button" onClick={() => navigate("/login")}>
              Go to sign in
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="subscribe-v2-page">
      <section className="subscribe-v2-hero">
        <div className="subscribe-v2-hero-bg" aria-hidden="true" />

        <div className="subscribe-v2-container subscribe-v2-hero-inner">
          <span className="subscribe-v2-eyebrow">Choose your plan</span>

          <h1>
            <span>Start with the creative workflow</span>
            <span>that fits how you work.</span>
          </h1>

          <p>
              Choose the plan that's right for you. Free users can get started instantly, while paid plans continue through Stripe's secure checkout.
          </p>

          <div className="subscribe-v2-assurances">
            <span>
              <ShieldCheck size={15} />
               No credit card required for Free
            </span>

            <span>
              <CreditCard size={15} />
              Secure Stripe checkout for paid plans
            </span>

            <span>
              <Sparkles size={15} />
              Upgrade anytime
            </span>
          </div>
        </div>
      </section>

      <section className="subscribe-v2-plans">
        <div className="subscribe-v2-container">
          {activationMessage && (
            <div className="subscribe-v2-notice" role="status">
              <span>Activate your workspace</span>
              <p>{activationMessage}</p>
            </div>
          )}

          {checkoutAbandoned && !isActive && (
            <div className="subscribe-v2-checkout-return" role="status">
              <div>
                <span>Checkout not completed</span>
                <p>
                  No payment was made. You can select any plan and open a new
                  secure checkout whenever you are ready.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCheckoutAbandoned(false)}
              >
                Dismiss
              </button>
            </div>
          )}

          {showSpinner && (
            <div className="subscribe-v2-processing" role="status">
              <span className="subscribe-v2-spinner" />
              <div>
                <strong>Finalizing your subscription</strong>
                <p>We are syncing your Stripe checkout and AdGen access.</p>
              </div>

              {status === "pending" && !syncing && sessionId && (
                <button type="button" onClick={manualRefresh}>
                  Refresh access
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="subscribe-v2-error" role="alert">
              <span>!</span>
              <p>{error}</p>
            </div>
          )}

          <div className="subscribe-v2-grid">
            {PLAN_OPTIONS.map((plan, index) => {
              const selected = plan.id === tier;

              return (
                <article
                  key={plan.id}
                  className={[
                    "subscribe-v2-card",
                    plan.featured ? "featured" : "",
                    selected ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ "--plan-delay": `${index * 80}ms` }}
                >
                  <div className="subscribe-v2-card-glow" aria-hidden="true" />

                  <button
                    type="button"
                    className="subscribe-v2-card-select"
                    onClick={() => setTier(plan.id)}
                    disabled={showSpinner || (isActive && !upgradeMode)}
                    aria-pressed={selected}
                    aria-label={`Select ${plan.label}`}
                  >
                    <span className="subscribe-v2-radio">
                      <i />
                    </span>

                    <span>{selected ? "Selected" : "Select plan"}</span>
                  </button>

                  <span className="subscribe-v2-card-eyebrow">
                    {plan.eyebrow}
                  </span>

                  <div className="subscribe-v2-card-head">
                    <h2>{plan.label}</h2>

                    {plan.featured && (
                      <span className="subscribe-v2-popular">Recommended</span>
                    )}
                  </div>

                  <p className="subscribe-v2-card-description">
                    {plan.description}
                  </p>

                  <div className="subscribe-v2-price">
                    <strong>${plan.price.toFixed(2)}</strong>
                    <span>/ month</span>
                  </div>

                  <div className="subscribe-v2-usage">
                    <span>{plan.images}</span>
                    <span>{plan.videos}</span>
                    <span>{plan.optimizer}</span>
                    <span>{plan.brands}</span>
                    <span>{plan.storage}</span>
                  </div>

                  <div className="subscribe-v2-divider" />

                  <h3>Included</h3>

                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <span>
                          <Check size={12} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="subscribe-v2-summary">
            <div>
              <span className="subscribe-v2-summary-label">Selected plan</span>
              <h2>{selectedPlan.label}</h2>
              <p>
                {selectedPlan.price === 0
                  ? "No credit card required."
                  : `$${selectedPlan.price.toFixed(2)} per month · billed monthly`}
              </p>
            </div>

            <div className="subscribe-v2-summary-actions">
              {!isActive || upgradeMode ? (
                <button
                  type="button"
                  className="subscribe-v2-primary"
                  onClick={
                    tier === "free"
                      ? activateFreePlan
                      : startSubscription
                  }
                  disabled={showSpinner || checkoutLoading}
                >
                  <span>
                    {tier === "free"
                    ? "Continue Free"
                    : checkoutLoading
                      ? "Opening checkout…"
                      : "Continue to Secure Checkout"}
                  </span>

                  {tier !== "free" && !checkoutLoading && (
                    <ArrowRight size={18} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="subscribe-v2-primary"
                  onClick={openBilling}
                >
                  Manage billing
                  <ArrowRight size={18} />
                </button>
              )}

              <Link to="/pricing" className="subscribe-v2-secondary">
                Compare full plan details
              </Link>
            </div>
          </div>

          <div className="subscribe-v2-account-note">
            <span>Signed in as</span>
            <strong>{currentUser.email}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}






