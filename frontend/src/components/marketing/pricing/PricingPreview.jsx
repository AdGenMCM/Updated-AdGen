import React from "react";
import "./PricingPreview.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import MarketingButton from "../actions/MarketingButton";
import Stagger from "../../motion/Stagger";
import TiltCard from "../../motion/TiltCard";

const plans = [
  {
    name: "Starter",
    price: "$34.99",
    text:
      "For creators and small businesses producing consistent creative content.",
    features: [
      "40 image generations",
      "6 video credits",
      "Brand Kit",
    ],
  },
  {
    name: "Pro",
    price: "$79.99",
    text:
      "For growing brands creating and optimizing campaigns every week.",
    features: [
      "100 image generations",
      "15 video credits",
      "30 Optimizer runs",
    ],
    featured: true,
  },
  {
    name: "Business",
    price: "$199.99",
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
        eyebrow="Simple plans"
        title="Choose the creative plan that fits your workflow."
        description="Start with the creative volume you need today and upgrade as your campaigns and production needs grow."
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
              {plan.featured && (
                <div className="adgen-plan-badge">
                  Recommended
                </div>
              )}

              <h3>{plan.name}</h3>

              <div className="adgen-plan-price">
                {plan.price}
                <span>/mo</span>
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
        <MarketingButton href="/pricing" size="lg">
          Compare all plans
        </MarketingButton>

        <MarketingButton
          href="/subscribe"
          size="lg"
          variant="secondary"
        >
          Start creating
        </MarketingButton>
      </div>
    </Section>
  );
}