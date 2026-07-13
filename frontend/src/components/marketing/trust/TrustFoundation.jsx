import React from "react";
import "./TrustFoundation.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import Stagger from "../../motion/Stagger";
import TiltCard from "../../motion/TiltCard";

const items = [
  {
    name: "Stay consistent",
    text:
      "Keep your brand direction connected to every image, video, and piece of copy.",
  },
  {
    name: "Move faster",
    text:
      "Reduce handoffs and tool switching across the full creative workflow.",
  },
  {
    name: "Keep control",
    text:
      "Review, refine, organize, and export every asset from one workspace.",
  },
  {
    name: "Learn what works",
    text:
      "Track real campaign performance instead of relying only on creative instinct.",
  },
];

export default function TrustFoundation() {
  return (
    <Section size="lg" container="wide" className="adgen-trust-section">
      <SectionHeader
        align="center"
        eyebrow="Built for confident execution"
        title="Create faster without losing clarity or control."
        description="AdGen helps your team move quickly while keeping the brand, assets, and performance context connected."
      />

      <Stagger
        className="adgen-trust-grid"
        childClassName="trust-item"
        delay={80}
      >
        {items.map((item, index) => (
          <TiltCard
            key={item.name}
            maxTilt={1}
            maxMove={1.5}
          >
            <article className="adgen-trust-card">
              <div className="adgen-trust-icon">
                {String(index + 1).padStart(2, "0")}
              </div>

              <h3>{item.name}</h3>

              <p>{item.text}</p>
            </article>
          </TiltCard>
        ))}
      </Stagger>
    </Section>
  );
}