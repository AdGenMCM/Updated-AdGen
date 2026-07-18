import React from "react";
import "./PricingPreview.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import MarketingButton from "../actions/MarketingButton";
import Stagger from "../../motion/Stagger";
import TiltCard from "../../motion/TiltCard";

const plans = [
  {
    name: "Free",
    price: "$0",
    suffix: "",
    text:
      "Start creating with no credit card required. Just create an account.",
    features: [
      "2 image generations",
      "Creative Library",
      "No credit card required",
    ],
    featured: true,
    badge: "Start free",
  },
  {
    name: "Pro",
    price: "$79.99",
    suffix: "/mo",
    text:
      "For growing brands creating and optimizing campaigns every week.",
    features: [
      "100 image generations",
      "15 video credits",
      "30 Optimizer runs",
    ],
    badge: "Most popular",
  },
  {
    name: "Business",
    price: "$199.99",
    suffix: "/mo",
    text:
      "For teams managing high-volume creative production across campaigns.",
    features: [
      "300 image generations",
      "50 video credits",
      "100 Optimizer runs",
    ],
  },
];

export default function PricingPreview() {
  return (
    <Section
      size="lg"
      container="wide"
      className="adgen-pricing-preview"
    >
      <SectionHeader
        align="center"
        eyebrow="Start free"
        title="Try AdGen MCM for free. Upgrade when you need more creative power."
        description="Generate your first ads with 2 free image generations and no credit card required. Upgrade only when you are ready for more images, videos, and optimization tools."
      />

      <Stagger
        className="adgen-pricing-grid"
        childClassName="pricing-item"
        delay={90}
      >
        {plans.map((plan) => (
          <TiltCard
            key={plan.name}
            maxTilt={1}
            maxMove={1.5}
          >
            <article
              className={`adgen-pricing-card ${
                plan.featured ? "featured" : ""
              }`}
            >
              {plan.badge && (
                <div className="adgen-plan-badge">
                  {plan.badge}
                </div>
              )}

              <h3>{plan.name}</h3>

              <div className="adgen-plan-price">
                {plan.price}
                {plan.suffix && <span>{plan.suffix}</span>}
              </div>

              <p>{plan.text}</p>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          </TiltCard>
        ))}
      </Stagger>

      <div className="adgen-pricing-actions">
        <MarketingButton href="/subscribe" size="lg">
          Start free
        </MarketingButton>

        <MarketingButton
          href="/pricing"
          size="lg"
          variant="secondary"
        >
          View all plans
        </MarketingButton>
      </div>
    </Section>
  );
}