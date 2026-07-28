import React from "react";
import "./FinalCTA.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";

import { trackEvent } from "../../../analytics/tracking";

export default function FinalCTA() {
  return (
    <Section
      size="xl"
      container="standard"
      align="center"
      className="adgen-final-cta"
    >
      <p className="adgen-final-eyebrow">
        Bring the full creative cycle together
      </p>

      <h2>Create, measure, and improve without rebuilding your workflow.</h2>

      <p className="adgen-final-copy">
        Bring your brand, image and video generation, editing, asset
        management, and Performance Intelligence into one connected platform.
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
          Performance Intelligence on Pro
        </span>
      </div>

      <div className="adgen-final-actions">
        <MarketingButton
          href="/subscribe"
          size="lg"
          onClick={() =>
            trackEvent("start_free_click", {
              location: "home_final_cta",
            })
          }
        >
          Start creating
        </MarketingButton>

        <MarketingButton href="/platform" size="lg" variant="secondary">
          Explore the platform
        </MarketingButton>
      </div>
    </Section>
  );
}