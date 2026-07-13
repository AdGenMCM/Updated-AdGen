import React from "react";
import "./FinalCTA.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";

export default function FinalCTA() {
  return (
    <Section
      size="xl"
      container="standard"
      align="center"
      className="adgen-final-cta"
    >
      <p className="adgen-final-eyebrow">
        Your next campaign can start here
      </p>

      <h2>Build better creative without rebuilding the workflow.</h2>

      <p className="adgen-final-copy">
        Bring your brand, campaign assets, creative history, and performance
        insights into one connected workspace built for continuous improvement.
      </p>

      <div className="adgen-final-proof">
        <span>
          <i aria-hidden="true" />
          Brand-aware generation
        </span>

        <span>
          <i aria-hidden="true" />
          One organized creative workspace
        </span>

        <span>
          <i aria-hidden="true" />
          Performance-guided improvement
        </span>
      </div>

      <div className="adgen-final-actions">
        <MarketingButton href="/subscribe" size="lg">
          Start creating
        </MarketingButton>

        <MarketingButton href="/platform" size="lg" variant="secondary">
          Explore the platform
        </MarketingButton>
      </div>
    </Section>
  );
}