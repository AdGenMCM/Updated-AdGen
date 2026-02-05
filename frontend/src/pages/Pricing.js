// src/pages/Pricing.js
import React from "react";
import "./Pricing.css";

const TIERS = [
  {
    id: "trial",
    name: "Trial",
    price: "$4.99",
    badge: "Starter trial",
    description: "Light usage to test AdGen MCM.",
    usesPerMonth: 5,
    ctaText: "Start Trial",
    highlighted: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$24.99",
    badge: "Popular",
    description: "For individuals running ads regularly.",
    usesPerMonth: 25,
    ctaText: "Choose Starter",
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49.99",
    badge: "Advanced",
    description: "Higher limits for scaling campaigns.",
    usesPerMonth: 60,
    ctaText: "Choose Pro",
    highlighted: false,
  },
  {
    id: "business",
    name: "Business",
    price: "$124.99",
    badge: "Best value",
    description: "Built for teams and heavy usage.",
    usesPerMonth: 175,
    ctaText: "Choose Business",
    highlighted: false,
  },
];

function formatUSD(n) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

export default function Pricing() {
  // Meta Ads service math
  const minSpend = 100;
  const serviceFeeRate = 0.25;
  const serviceFee = minSpend * serviceFeeRate;
  const total = minSpend + serviceFee;

  // Modal state
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedTier, setSelectedTier] = React.useState(null);

  const openModal = (tier) => {
    setSelectedTier(tier);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTier(null);
  };

  // Close on ESC
  React.useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  // Prevent background scroll when modal is open
  React.useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isModalOpen]);

  return (
    <main className="pricing-page">
      <div className="pricing-container">
        <header className="pricing-header">
          <h1 className="pricing-title">Products, Services, & Pricing</h1>
          <p className="pricing-subtitle">
            Simple monthly pricing. Usage resets at the start of each month.
          </p>
        </header>

        <section className="pricing-grid" aria-label="SaaS pricing tiers">
          {TIERS.map((tier) => (
            <article key={tier.id} className={`tier-card ${tier.highlighted ? "highlighted" : ""}`}>
              <div className="tier-top">
                <div className="tier-name-row">
                  <h2 className="tier-name">{tier.name}</h2>
                  <span className="tier-badge">{tier.badge}</span>
                </div>

                <p className="tier-desc">{tier.description}</p>

                <div className="tier-price">
                  <span className="tier-price-amount">{tier.price}</span>
                  <span className="tier-price-suffix">/mo</span>
                </div>

                {/* ✅ No billing redirect: show modal */}
                <button
                  type="button"
                  className={`tier-cta ${tier.highlighted ? "primary" : ""}`}
                  onClick={() => openModal(tier)}
                >
                  {tier.ctaText}
                </button>
              </div>

              <div className="tier-divider" />

              <div className="tier-section">
                <h3 className="tier-section-title">Usage limits</h3>
                <ul className="tier-limits">
                  <li>
                    <span>AI generations</span>
                    <strong>{tier.usesPerMonth} / month</strong>
                  </li>
                </ul>
              </div>

              <div className="tier-section">
                <h3 className="tier-section-title">Includes</h3>
                <ul className="tier-includes">
                  <li>AI ad text & image generation</li>
                  <li>Text Editor</li>
                  <li>Email support</li>
                </ul>
              </div>
            </article>
          ))}
        </section>

        {/* NEW SERVICE OFFERING */}
        <section className="service-wrap" aria-label="Meta Ads campaign setup service">
          <div className="service-card">
            <div className="service-header">
              <div>
                <h2 className="service-title">Meta Ads Campaign Setup</h2>
                <p className="service-subtitle">
                  We’ll build and launch a Meta ad campaign tailored to drive high engagement, clicks,
                  and traffic to your landing page across Meta’s advertising platform.
                </p>
              </div>
              <span className="service-badge">Done-for-you</span>
            </div>

            <div className="service-grid">
              <div className="service-block">
                <h3 className="service-block-title">What you get</h3>
                <ul className="service-list">
                  <li>Campaign structure + objective selection (traffic / conversions)</li>
                  <li>Audience targeting strategy (interests / lookalikes where applicable)</li>
                  <li>Ad set setup + placements across Meta</li>
                  <li>Creative + copy recommendations aligned to your offer</li>
                  <li>Landing page traffic optimization focus</li>
                </ul>
              </div>

              <div className="service-block">
                <h3 className="service-block-title">Pricing</h3>

                <div className="service-pricing">
                  <div className="service-line">
                    <span>Minimum campaign spend</span>
                    <strong>{formatUSD(minSpend)}</strong>
                  </div>
                  <div className="service-line">
                    <span>Service fee (25%)</span>
                    <strong>{formatUSD(serviceFee)}</strong>
                  </div>
                  <div className="service-total">
                    <span>Minimum total</span>
                    <strong>{formatUSD(total)}</strong>
                  </div>
                </div>

                <p className="service-note">
                  Campaign spend is the advertising budget applied to Meta. A 25% service fee is added
                  to your bill. <strong>Payment is handled by invoice</strong> after we confirm campaign
                  details.
                </p>

                <a className="service-cta" href="/contact">
                  Request Campaign Setup
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="pricing-faq" aria-label="Usage and billing details">
          <h2 className="pricing-h2">How usage works</h2>
          <p className="pricing-p">
            Each plan includes a fixed number of AI generations per month. One successful click of
            “Generate” counts as one use. Usage resets automatically at the beginning of each month.
          </p>

          <h3 className="pricing-h3">What happens if I hit my limit?</h3>
          <p className="pricing-p">
            If you reach your monthly limit, generation will be paused until your usage resets.
          </p>

          <h3 className="pricing-h3">Billing & cancellations</h3>
          <p className="pricing-p">
            Subscriptions are billed monthly through Stripe. You can cancel at any time; access
            remains until the end of your billing period. Charges are non-refundable except where
            required by law.
          </p>

          <div className="pricing-links">
            <a className="pricing-link" href="/terms">Terms</a>
            <span className="dot">•</span>
            <a className="pricing-link" href="/privacy">Privacy</a>
          </div>
        </section>
      </div>

      {/* ✅ Modal */}
      {isModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={closeModal}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedTier ? `Selected Plan: ${selectedTier.name}` : "Get Started"}
              </h3>
              <button className="modal-close" type="button" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <p className="modal-text">
              <strong>Create an account and log in to get started.</strong>
              <br />
              If you already have an account and want to change your plan, log in and go to the{" "}
              <strong>My Account</strong> page.
            </p>

            <div className="modal-actions">
              <a className="modal-btn primary" href="/subscribe">
                Create Account / Log In
              </a>
            </div>

            <p className="modal-footnote">
              Note: Plan changes are managed from your account.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}



