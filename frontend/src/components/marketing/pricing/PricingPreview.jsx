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
      "Create your first image and video assets with no credit card required.",
    features: [
      "2 lifetime image generations",
      "1 lifetime video credit",
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
      "For active advertisers ready to connect creation with real campaign performance.",
    features: [
      "100 image generations",
      "14 video credits",
      "20 Optimizer runs",
      "Performance Intelligence",
    ],
    badge: "Most popular",
  },
  {
    name: "Business",
    price: "$199.99",
    suffix: "/mo",
    text:
      "For teams and agencies managing higher-volume, multi-brand creative workflows.",
    features: [
      "250 image generations",
      "32 video credits",
      "75 Optimizer runs",
      "10 Brand Kits",
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
        title="Start free. Unlock campaign learning when your workflow is ready."
        description="Free gives you a simple way to create. Pro and Business add Performance Intelligence, Google Ads integration, and higher production limits."
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