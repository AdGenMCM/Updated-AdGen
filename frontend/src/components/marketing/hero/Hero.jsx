import React from "react";
import "./Hero.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";
import ProductCanvas from "../ProductCanvas";
import ProductMomentCard from "../ProductMomentCard";
import DashboardPreview from "../DashboardPreview";

export default function Hero() {
  return (
    <Section
      size="xl"
      container="wide"
      align="center"
      className="adgen-marketing-hero"
    >
      <div className="adgen-marketing-hero-bg" />

      <div className="adgen-marketing-hero-content">
        <p className="adgen-marketing-hero-eyebrow">
          Creative intelligence for modern brands
        </p>

        <h1>
          <span className="marketing-hero-line marketing-hero-line-primary">
            Better creative starts here.
          </span>

          <span className="marketing-hero-line marketing-hero-line-secondary">
            Build, refine, and improve every campaign in one place.
          </span>
        </h1>

        <p className="adgen-marketing-hero-description">
          Turn your brand direction into campaign-ready images, videos, and
          copy—then use real performance signals to create stronger work every
          time.
        </p>

        <div className="adgen-marketing-hero-actions">
          <MarketingButton href="/subscribe" size="lg">
            Start Free
          </MarketingButton>

          <MarketingButton href="/platform" size="lg" variant="secondary">
            Explore the platform
          </MarketingButton>
        </div>
        <p className="adgen-marketing-hero-description">✓ 2 free generations, ✓ No credit card required, ✓ Takes less than 2 minutes</p>
        <div
          className="adgen-marketing-hero-proof"
          aria-label="AdGen platform benefits"
        >
          <span>
            <i aria-hidden="true" />
            Brand-aware creative
          </span>

          <span>
            <i aria-hidden="true" />
            Image, video, and copy
          </span>

          <span>
            <i aria-hidden="true" />
            Performance-guided improvement
          </span>
        </div>
      </div>

      <div className="adgen-marketing-hero-visual">
        <ProductCanvas
          variant="hero"
          alt="AdGen creative platform dashboard showing brand, generation, and performance workflows"
          floatingCards={
            <>
              <ProductMomentCard
                position="top-left"
                status="success"
                icon="brand"
                eyebrow="Brand Kit"
                title="Brand applied"
                detail="Logo, colors, fonts, and voice connected"
              />

              <ProductMomentCard
                position="top-right"
                status="active"
                icon="spark"
                eyebrow="Creative"
                title="Campaign building"
                detail="Images, video, and copy in progress"
              />

              <ProductMomentCard
                position="bottom-left"
                status="insight"
                icon="chart"
                eyebrow="Performance"
                title="Winner identified"
                detail="Creative signals ready for reuse"
              />

              <ProductMomentCard
                position="bottom-right"
                status="video"
                icon="video"
                eyebrow="Delivery"
                title="Creative ready"
                detail="Campaign assets prepared for launch"
              />
            </>
          }
        >
          <DashboardPreview />
        </ProductCanvas>
      </div>
    </Section>
  );
}