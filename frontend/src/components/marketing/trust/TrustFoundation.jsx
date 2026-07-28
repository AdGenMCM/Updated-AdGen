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
      "Use qualified campaign results to understand what should influence the next generation.",
  },
];

export default function TrustFoundation() {
  return (
    <Section size="lg" container="wide" className="adgen-trust-section">
      <SectionHeader
        align="center"
        eyebrow="Built for real creative work"
        title="Move faster without losing consistency, context, or control."
        description="ADGen gives marketers one place to create, refine, organize, and learn from campaign performance."
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