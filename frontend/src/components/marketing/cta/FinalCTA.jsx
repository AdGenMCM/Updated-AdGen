import React from "react";
import "./FinalCTA.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";

export default function FinalCTA() {
  return (
    <Section size="xl" container="standard" align="center" className="adgen-final-cta">
      <p className="adgen-final-eyebrow">Ready when you are</p>

      <h2>Start creating campaign-ready creative today.</h2>

      <p className="adgen-final-copy">
        Build your brand foundation, generate better creative, organize every
        asset, and improve performance from one connected workspace.
      </p>

      <div className="adgen-final-actions">
        <MarketingButton href="/subscribe" size="lg">
          Start creating
        </MarketingButton>

        <MarketingButton href="/platform" size="lg" variant="secondary">
          See the platform
        </MarketingButton>
      </div>
    </Section>
  );
}