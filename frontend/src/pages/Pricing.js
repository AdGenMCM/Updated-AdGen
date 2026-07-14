import React from "react";
import "./Pricing.css";

import Reveal from "../components/motion/Reveal";
import MarketingButton from "../components/marketing/actions/MarketingButton";

const TIERS = [
  {
    id: "trial_monthly",
    name: "Trial",
    price: "$9.99",
    eyebrow: "Explore the platform",
    description:
      "A low-friction way to experience AdGen's full creative workflow with real image and video generation.",
    images: "10",
    videos: "2",
    optimizer: "—",
    brands: "1",
    storage: "2 GB",
    cta: "Start Trial",
    includes: [
      "Image generation",
      "Ad copy generation",
      "Video generation",
      "Brand Kit",
      "Creative Studio",
      "Creative Library",
    ],
  },
  {
    id: "starter_monthly",
    name: "Starter",
    price: "$34.99",
    eyebrow: "For growing creators",
    description:
      "For freelancers, small businesses, and operators who need a dependable monthly creative workflow.",
    images: "40",
    videos: "5",
    optimizer: "—",
    brands: "1",
    storage: "10 GB",
    cta: "Choose Starter",
    includes: [
      "Everything in Trial",
      "Higher image generation limits",
      "More premium video credits",
      "Brand-aware creative defaults",
      "Creative Studio",
      "Library and asset storage",
    ],
  },
  {
    id: "pro_monthly",
    name: "Pro",
    price: "$79.99",
    eyebrow: "Most popular",
    description:
      "For active advertisers who want to create, optimize, measure, and improve campaigns from one workspace.",
    images: "100",
    videos: "12",
    optimizer: "20",
    brands: "3",
    storage: "50 GB",
    cta: "Choose Pro",
    highlighted: true,
    includes: [
      "Everything in Starter",
      "Creative Optimizer",
      "Performance tracking",
      "Winner analysis",
      "Advanced Insights",
      "Multiple Brand Kits",
    ],
  },
  {
    id: "business_monthly",
    name: "Business",
    price: "$199.99",
    eyebrow: "For teams and agencies",
    description:
      "Higher limits, more brands, and deeper creative intelligence for multi-brand and high-volume workflows.",
    images: "250",
    videos: "30",
    optimizer: "75",
    brands: "10",
    storage: "200 GB",
    cta: "Choose Business",
    includes: [
      "Everything in Pro",
      "10 Brand Kits",
      "Priority generation",
      "Higher optimizer limits",
      "Expanded creative storage",
      "Priority support",
    ],
  },
];

const COMPARISON_ROWS = [
  ["Image generations", "10", "40", "100", "250"],
  ["Video credits", "2", "5", "12", "30"],
  ["Optimizer runs", "—", "—", "20", "75"],
  ["Brand Kits", "1", "1", "3", "10"],
  ["Creative storage", "2 GB", "10 GB", "50 GB", "200 GB"],
  ["Image generation", true, true, true, true],
  ["Video generation", true, true, true, true],
  ["Ad copy", true, true, true, true],
  ["Ad copy generation", true, true, true, true],
  ["Video generation", true, true, true, true],
  ["Creative Studio", true, true, true, true],
  ["Creative Library", true, true, true, true],
  ["Performance tracking", false, false, true, true],
  ["Winner analysis", false, false, true, true],
  ["Advanced Insights", false, false, true, true],
  ["Priority generation", false, false, false, true],
];

const FAQS = [
  {
    question: "What counts as a video credit?",
    answer:
      "A video up to 6 seconds uses 1 credit. A 10-second video uses 2 credits. Credits reset with your billing cycle.",
  },
  {
    question: "Do unused generations roll over?",
    answer:
      "No. Image, video, and Optimizer allowances reset at the beginning of each billing cycle.",
  },
  {
    question: "Can I upgrade or downgrade later?",
    answer:
      "Yes. You can manage your plan through My Account and Stripe's secure billing portal.",
  },
  {
    question: "What happens when I reach a limit?",
    answer:
      "Generation pauses for that resource until your next billing cycle or until you move to a higher plan.",
  },
  {
    question: "What happens if I reach my storage limit?",
    answer:
      "New uploads and generations pause until you free storage or upgrade. Existing assets remain available.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. There are no long-term contracts, and subscription management is handled securely through Stripe.",
  },
];

function CheckCell({ value }) {
  if (typeof value !== "boolean") {
    return <span className="pricing-v2-value">{value}</span>;
  }

  return value ? (
    <span className="pricing-v2-check" aria-label="Included">✓</span>
  ) : (
    <span className="pricing-v2-dash" aria-label="Not included">—</span>
  );
}

export default function Pricing() {
  return (
    <main className="pricing-page pricing-v2">
      <section className="pricing-v2-hero">
        <div className="pricing-v2-hero-bg" />

        <div className="pricing-v2-container pricing-v2-hero-inner">
          <p className="pricing-v2-eyebrow">Pricing</p>

          <h1>
            <span>Choose the creative plan</span>
            <span>that fits your workflow.</span>
          </h1>

          <p className="pricing-v2-description">
            Start with the tools you need today and unlock more generation,
            optimization, brand capacity, and creative intelligence as your
            workflow grows.
          </p>

          <div className="pricing-v2-billing-toggle" aria-label="Billing frequency">
            <button type="button" className="active">Monthly</button>
            <button type="button" disabled>
              Annual
              <span>Coming soon</span>
            </button>
          </div>

          <div className="pricing-v2-proof" aria-label="Pricing assurances">
            <span><i /> Cancel anytime</span>
            <span><i /> Secure Stripe billing</span>
            <span><i /> Upgrade whenever you grow</span>
          </div>
        </div>
      </section>

      <section className="pricing-v2-plans">
        <div className="pricing-v2-container">
          <div className="pricing-v2-grid">
            {TIERS.map((tier, index) => (
              <Reveal key={tier.id} delay={index * 90}>
                <article
                  className={[
                    "pricing-v2-card",
                    tier.highlighted ? "featured" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className="pricing-v2-card-glow" aria-hidden="true" />

                  <div className="pricing-v2-card-head">
                    <div>
                      <span className="pricing-v2-card-eyebrow">
                        {tier.eyebrow}
                      </span>
                      <h2>{tier.name}</h2>
                    </div>

                    {tier.highlighted && (
                      <span className="pricing-v2-popular">Recommended</span>
                    )}
                  </div>

                  <p className="pricing-v2-card-description">
                    {tier.description}
                  </p>

                  <div className="pricing-v2-price">
                    <strong>{tier.price}</strong>
                    <span>/ month</span>
                  </div>

                  <MarketingButton
                    href={`/subscribe?tier=${tier.id}`}
                    size="lg"
                    variant={tier.highlighted ? "primary" : "secondary"}
                    className="pricing-v2-card-cta"
                  >
                    {tier.cta}
                  </MarketingButton>

                  <div className="pricing-v2-metrics">
                    <div>
                      <span>Images</span>
                      <strong>{tier.images}</strong>
                    </div>
                    <div>
                      <span>Video credits</span>
                      <strong>{tier.videos}</strong>
                    </div>
                    <div>
                      <span>Optimizer</span>
                      <strong>{tier.optimizer}</strong>
                    </div>
                    <div>
                      <span>Brands</span>
                      <strong>{tier.brands}</strong>
                    </div>
                  </div>

                  <div className="pricing-v2-storage">
                    <span>Creative storage</span>
                    <strong>{tier.storage}</strong>
                  </div>

                  <div className="pricing-v2-divider" />

                  <h3>What is included</h3>

                  <ul>
                    {tier.includes.map((item) => (
                      <li key={item}>
                        <span aria-hidden="true">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-v2-story">
        <div className="pricing-v2-container">
          <Reveal>
            <div className="pricing-v2-story-head">
              <span className="pricing-v2-pill">One connected platform</span>

              <h2>Pay for a complete creative workflow—not another disconnected tool.</h2>

              <p>
                Every plan combines image generation, video creation, ad copy,
                brand guidance, editing, asset management, and storage in one
                connected workspace.
              </p>
            </div>
          </Reveal>

          <div className="pricing-v2-story-grid">
            {[
              ["Create", "Generate campaign-ready images, video, copy, hooks, and calls to action."],
              ["Stay consistent", "Apply your Brand Kit across every creative workflow."],
              ["Refine", "Polish assets in Creative Studio without leaving the platform."],
              ["Improve", "Use performance data and Optimizer insights to guide what comes next."],
            ].map(([title, text], index) => (
              <Reveal key={title} delay={index * 80}>
                <article className="pricing-v2-story-card">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-v2-compare">
        <div className="pricing-v2-container">
          <Reveal>
            <div className="pricing-v2-section-head">
              <span className="pricing-v2-pill">Compare plans</span>
              <h2>See exactly what each plan unlocks.</h2>
              <p>
                Start small, then move into optimization, performance tracking,
                advanced insights, and multi-brand workflows when you need them.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="pricing-v2-table-shell">
              <table className="pricing-v2-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    {TIERS.map((tier) => (
                      <th key={tier.id}>{tier.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map(([label, ...values]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {values.map((value, index) => (
                        <td key={`${label}-${TIERS[index].id}`}>
                          <CheckCell value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pricing-v2-faq">
        <div className="pricing-v2-container pricing-v2-faq-inner">
          <Reveal>
            <div className="pricing-v2-section-head">
              <span className="pricing-v2-pill">FAQ</span>
              <h2>Questions before you get started?</h2>
              <p>
                Everything you need to know about usage, billing, storage, and plan changes.
              </p>
            </div>
          </Reveal>

          <div className="pricing-v2-faq-list">
            {FAQS.map((item, index) => (
              <Reveal key={item.question} delay={index * 55}>
                <details className="pricing-v2-faq-item">
                  <summary>
                    <span>{item.question}</span>
                    <i aria-hidden="true">+</i>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-v2-final">
        <div className="pricing-v2-final-light" aria-hidden="true" />

        <div className="pricing-v2-container pricing-v2-final-inner">
          <Reveal>
            <span className="pricing-v2-final-pill">Ready to create better ads?</span>

            <h2>Build better creative without rebuilding your workflow.</h2>

            <p>
              Bring your brand, image generation, video, copy, optimization,
              asset management, and performance intelligence into one platform.
            </p>

            <div className="pricing-v2-final-actions">
              <MarketingButton
                href="/subscribe?tier=starter_monthly"
                size="lg"
                className="pricing-v2-final-primary"
              >
                Start creating
              </MarketingButton>

              <MarketingButton
                href="/platform"
                size="lg"
                variant="secondary"
                className="pricing-v2-final-secondary"
              >
                Explore the platform
              </MarketingButton>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}







