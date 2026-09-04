import React from "react";
import "./Hero.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";

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
          Most AI creative tools generate an ad and stop there. ADGen helps you create campaign-ready ads, understand what is driving performance, identify what deserves attention, and improve every campaign that follows.
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
            Performance & Campaign Intelligence on Pro
          </span>
        </div>
      </div>

    </Section>
  );
}