// src/pages/Pricing.js
import React from "react";
import "./Pricing.css";

const TIERS = [
  {
    id: "trial",
    name: "Trial",
    price: "$4.99",
    badge: "Try it",
    bestFor: "Best for trying AdGen MCM.",
    description: "Experience the platform before committing.",
    imageUses: "5",
    videoUses: "—",
    ctaText: "Start Trial",
    highlighted: false,
    includes: [
      "AI Image Ads",
      "AI Ad Copy",
      "Creative Library",
      "Text Editor",
      "Email Support",
    ],
  },
  {
    id: "early_access",
    name: "Early Access",
    price: "$14.99",
    badge: "Video Access",
    bestFor: "Best for exploring AI video ads.",
    description: "Get image-to-video and prompt-to-video tools at a lower entry price.",
    imageUses: "10",
    videoUses: "3",
    ctaText: "Choose Early Access",
    highlighted: false,
    includes: [
      "AI Image Ads",
      "AI Video Ads",
      "AI Ad Copy",
      "Creative Library",
      "Text Editor",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$24.99",
    badge: "Popular",
    bestFor: "Best for solo advertisers.",
    description: "Create fresh image ads and copy every week.",
    imageUses: "25",
    videoUses: "—",
    ctaText: "Choose Starter",
    highlighted: false,
    includes: [
      "AI Image Ads",
      "AI Ad Copy",
      "Creative Library",
      "Text Editor",
      "Email Support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49.99",
    badge: "Best Value",
    bestFor: "Best for active ad campaigns.",
    description: "Create, analyze, and improve your advertising creative.",
    imageUses: "60",
    videoUses: "15",
    ctaText: "Choose Pro",
    highlighted: true,
    includes: [
      "AI Image Ads",
      "AI Video Ads",
      "AI Ad Copy",
      "Creative Library",
      "Text Editor",
      "Performance Insights",
      "Winners Engine",
      "Priority Support",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$124.99",
    badge: "Teams",
    bestFor: "Best for agencies and teams.",
    description: "Higher limits for multiple brands or high-volume creative testing.",
    imageUses: "175",
    videoUses: "50",
    ctaText: "Choose Business",
    highlighted: false,
    includes: [
      "Everything in Pro",
      "Higher image limits",
      "Higher video limits",
      "Winners Engine",
      "Priority Support",
    ],
  },
];

const FEATURES = [
  ["AI Image Ads", true, true, true, true, true],
  ["AI Video Ads", false, true, false, true, true],
  ["AI Ad Copy", true, true, true, true, true],
  ["Text Editor", true, true, true, true, true],
  ["Creative Library", true, true, true, true, true],
  ["Performance Insights", false, false, false, true, true],
  ["Winners Engine", false, false, false, true, true],
  ["Priority Support", false, false, false, true, true],
];

function CheckMark({ enabled }) {
  return enabled ? (
    <span className="compare-check">✓</span>
  ) : (
    <span className="compare-dash">—</span>
  );
}

export default function Pricing() {
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

  React.useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  React.useEffect(() => {
    if (!isModalOpen) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <div className="pricing-container">
          <span className="pricing-pill">AdGen MCM Pricing</span>

          <h1 className="pricing-title">
            Simple pricing for every stage of your advertising workflow.
          </h1>

          <p className="pricing-subtitle">
            Generate AI image ads, video ads, ad copy, and creative insights from
            one platform. Upgrade anytime as your advertising needs grow.
          </p>

          <div className="pricing-trust">
            <span>No long-term contracts</span>
            <span>Cancel anytime</span>
            <span>Secure payments through Stripe</span>
          </div>
        </div>
      </section>

      <section className="pricing-container">
        <div className="pricing-grid" aria-label="Pricing tiers">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={`tier-card ${tier.highlighted ? "highlighted" : ""}`}
            >
              {tier.highlighted && <div className="tier-ribbon">Recommended</div>}

              <div className="tier-name-row">
                <h2 className="tier-name">{tier.name}</h2>
                <span className="tier-badge">{tier.badge}</span>
              </div>

              <p className="tier-best">{tier.bestFor}</p>
              <p className="tier-desc">{tier.description}</p>

              <div className="tier-price">
                <span className="tier-price-amount">{tier.price}</span>
                <span className="tier-price-suffix">/mo</span>
              </div>

              <button
                type="button"
                className={`tier-cta ${tier.highlighted ? "primary" : ""}`}
                onClick={() => openModal(tier)}
              >
                {tier.ctaText}
              </button>

              <div className="tier-divider" />

              <div className="tier-section">
                <h3 className="tier-section-title">Includes</h3>
                <ul className="tier-includes">
                  {tier.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="tier-section tier-usage-section">
                <h3 className="tier-section-title">Monthly usage</h3>
                <div className="tier-usage">
                  <div>
                    <span>AI Images</span>
                    <strong>{tier.imageUses}</strong>
                  </div>
                  <div>
                    <span>AI Videos</span>
                    <strong>{tier.videoUses}</strong>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="pricing-panel" aria-label="Compare plans">
          <div className="pricing-panel-header">
            <div>
              <span className="pricing-panel-kicker">Compare Plans</span>
              <h2>Find the plan that fits your creative workflow.</h2>
              <p>
                Start small, then unlock video generation, performance insights,
                and the Winners Engine as your campaigns grow.
              </p>
            </div>
          </div>

          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Trial</th>
                  <th>Early</th>
                  <th>Starter</th>
                  <th>Pro</th>
                  <th>Business</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(([feature, trial, early, starter, pro, business]) => (
                  <tr key={feature}>
                    <td>{feature}</td>
                    <td><CheckMark enabled={trial} /></td>
                    <td><CheckMark enabled={early} /></td>
                    <td><CheckMark enabled={starter} /></td>
                    <td><CheckMark enabled={pro} /></td>
                    <td><CheckMark enabled={business} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-panel" aria-label="Why upgrade">
          <div className="pricing-panel-header">
            <div>
              <span className="pricing-panel-kicker">Why Upgrade?</span>
              <h2>As your campaigns grow, your creative system should grow too.</h2>
              <p>
                Pro and Business unlock tools designed for advertisers who need
                more creative volume, stronger testing, and a smarter feedback loop.
              </p>
            </div>
          </div>

          <div className="upgrade-grid">
            <div className="upgrade-card">
              <h3>Create more</h3>
              <p>
                Generate more ad concepts every month, including short-form video
                ads for platforms like TikTok, Reels, and Shorts.
              </p>
              <ul>
                <li>More image generations</li>
                <li>AI video ads</li>
                <li>More creative variations</li>
              </ul>
            </div>

            <div className="upgrade-card">
              <h3>Improve faster</h3>
              <p>
                Track performance and use your highest-performing ads to guide
                future creative generations.
              </p>
              <ul>
                <li>Performance Insights</li>
                <li>Winners Engine</li>
                <li>Better future creative direction</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="pricing-faq" aria-label="Frequently asked questions">
          <div className="pricing-faq-header">
            <span className="pricing-panel-kicker">FAQ</span>
            <h2>Frequently Asked Questions</h2>
          </div>

          <div className="faq-grid">
            <div className="faq-item">
              <h3>How do monthly generations work?</h3>
              <p>
                Each successful generation counts toward your monthly allowance.
                Image and video generations are tracked separately where video is included.
              </p>
            </div>

            <div className="faq-item">
              <h3>Can I upgrade or downgrade later?</h3>
              <p>
                Yes. You can manage your plan from the My Account page after logging in.
              </p>
            </div>

            <div className="faq-item">
              <h3>What happens if I reach my limit?</h3>
              <p>
                Generation pauses until your next billing cycle or until you upgrade.
              </p>
            </div>

            <div className="faq-item">
              <h3>Do unused generations roll over?</h3>
              <p>
                No. Monthly usage resets each billing cycle.
              </p>
            </div>

            <div className="faq-item">
              <h3>Is payment secure?</h3>
              <p>
                Yes. Subscriptions are securely processed through Stripe.
              </p>
            </div>
          </div>

          <div className="pricing-links">
            <a className="pricing-link" href="/terms">Terms</a>
            <span className="dot">•</span>
            <a className="pricing-link" href="/privacy">Privacy</a>
          </div>
        </section>
      </section>

      {isModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={closeModal}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedTier ? `Selected Plan: ${selectedTier.name}` : "Get Started"}
              </h3>

              <button
                className="modal-close"
                type="button"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="modal-text">
              <strong>Create an account and log in to get started.</strong>
              <br />
              If you already have an account and want to change your plan, log in
              and go to the <strong>My Account</strong> page.
            </p>

            <div className="modal-actions">
              <a className="modal-btn primary" href="/subscribe">
                Create Account / Log In
              </a>
            </div>

            <p className="modal-footnote">
              Plan changes are managed from your account.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}





