import React from "react";
import "./PlatformShowcase.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import MarketingButton from "../actions/MarketingButton";

const scatteredTools = [
  "Brand documents",
  "Image generators",
  "Video tools",
  "Copy documents",
  "Asset folders",
  "Disconnected analytics",
];

const connectedBenefits = [
  {
    label: "One Brand Kit",
    title: "Every asset starts from the same direction.",
  },
  {
    label: "One Workspace",
    title: "Images, video, copy, and editing stay connected.",
  },
  {
    label: "One Creative History",
    title: "Past work remains organized and ready to reuse.",
  },
  {
    label: "Performance Intelligence",
    title: "Qualified results guide future image and video generations.",
  },
];

export default function PlatformShowcase() {
  return (
    <Section size="lg" container="wide" className="adgen-platform-section">
      <SectionHeader
        align="center"
        eyebrow="One connected platform"
        title="Stop starting every campaign from zero."
        description="Your brand, production workflow, creative history, and campaign results should stay connected instead of living in separate tools."
      />

      <div className="adgen-platform-transformation">
        <div className="adgen-platform-scattered">
          <div className="adgen-platform-panel-label">
            The scattered workflow
          </div>

          <h3>A workflow that loses context.</h3>

          <p>
            Creative direction, assets, and campaign results live in separate
            systems—so the lessons from one campaign rarely improve the next.
          </p>

          <div className="adgen-platform-tool-cloud">
            {scatteredTools.map((tool, index) => (
              <span
                key={tool}
                style={{ "--tool-delay": `${index * 60}ms` }}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>

        <div className="adgen-platform-connector" aria-hidden="true">
          <span>→</span>
        </div>

        <div className="adgen-platform-connected">
          <div className="adgen-platform-panel-label">
            The connected workflow
          </div>

          <h3>One system that carries the work forward.</h3>

          <p>
            ADGen keeps your brand, creative assets, campaign context, and
            performance history together. Performance Intelligence then turns
            qualified results into guidance for future generations.
          </p>

          <div className="adgen-platform-benefit-grid">
            {connectedBenefits.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.title}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>


      <div className="adgen-platform-action">
        <MarketingButton
          href="/platform#generated-examples"
          size="lg"
        >
          See what ADGen MCM creates
        </MarketingButton>

        <a
          href="/platform"
          className="adgen-platform-secondary-link"
        >
          Explore the complete platform →
        </a>
      </div>
    </Section>
  );
}