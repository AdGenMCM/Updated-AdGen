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
    price: "$24.99",
    text: "For solo creators testing and producing ad creative.",
    features: [
      "25 image generations",
      "Creative Studio",
      "Creative Library",
    ],
  },
  {
    name: "Pro",
    price: "$49.99",
    text:
      "For marketers who want more creative volume and optimization.",
    features: [
      "60 image generations",
      "Creative Optimizer",
      "Performance Insights",
    ],
    featured: true,
  },
  {
    name: "Business",
    price: "$124.99",
    text:
      "For teams producing more creative across image and video formats.",
    features: [
      "175 image generations",
      "Video Ads",
      "Higher monthly limits",
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