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
  "Performance sheets",
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
    label: "One Learning Loop",
    title: "Performance improves what you create next.",
  },
];

export default function PlatformShowcase() {
  return (
    <Section size="lg" container="wide" className="adgen-platform-section">
      <SectionHeader
        align="center"
        eyebrow="Less fragmentation"
        title="Stop switching between disconnected creative tools."
        description="Your brand direction, creative production, editing, organization, and performance data should strengthen each other—not live in separate tabs."
      />

      <div className="adgen-platform-transformation">
        <div className="adgen-platform-scattered">
          <div className="adgen-platform-panel-label">
            The scattered workflow
          </div>

          <h3>Too many tools. Too little continuity.</h3>

          <p>
            Creative direction gets copied between documents, generators,
            editors, folders, and spreadsheets—forcing every campaign to start
            over.
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

          <h3>One system that remembers the work.</h3>

          <p>
            AdGen keeps your brand, creative assets, campaign context, and
            performance insights connected from one campaign to the next.
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
          See what AdGen MCM creates
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