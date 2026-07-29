import React from "react";
import "./Hero.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";
import ProductCanvas from "../ProductCanvas";
import ProductMomentCard from "../ProductMomentCard";
import DashboardPreview from "../DashboardPreview";

import { trackEvent } from "../../../analytics/tracking";

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
          THE CREATIVE PLATFORM THAT LEARNS WHAT WORKS
        </p>

        <h1>
          <span className="marketing-hero-line marketing-hero-line-primary">
            Create better ads. Learn from every campaign.
          </span>

          <span className="marketing-hero-line marketing-hero-line-secondary">
            Create, measure, and improve in one connected workspace.
          </span>
        </h1>

        <p className="adgen-marketing-hero-description">
          Most AI creative tools generate an ad and stop there. ADGen helps you generate, track campaign performance, optimize creatives, and improve every future campaign.
        </p>

        <p className="adgen-marketing-hero-description-small">
          Now analyzes campaign data from Google Ads, Meta Ads, and your Creative Library to improve future assets (Pro and Business plans).
        </p>

        <div className="adgen-marketing-hero-actions">
          <MarketingButton
            href="/subscribe"
            size="lg"
            onClick={() =>
              trackEvent("start_free_click", {
                location: "home_hero",
              })
            }
          >
            Start Free
          </MarketingButton>

          <MarketingButton href="/platform" size="lg" variant="secondary">
            Explore the platform
          </MarketingButton>
        </div>
        <p className="adgen-marketing-hero-description">✓ 2 free image generations · ✓ 1 free video credit · ✓ No credit card required</p>
        <div
          className="adgen-marketing-hero-proof"
          aria-label="ADGen platform benefits"
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
            Performance Intelligence on Pro
          </span>
        </div>
      </div>

      <div className="adgen-marketing-hero-visual">
        <ProductCanvas
          variant="hero"
          alt="ADGen creative platform dashboard showing brand, generation, and performance workflows"
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
                title="Performance signal found"
                detail="Qualified results ready to guide what comes next"
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