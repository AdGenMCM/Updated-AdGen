import React from "react";
import "./TrustFoundation.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import Stagger from "../../motion/Stagger";
import TiltCard from "../../motion/TiltCard";

const items = [
  { name: "Brand Kit", text: "Keep logos, colors, fonts, and creative direction consistent." },
  { name: "Images", text: "Generate campaign-ready visuals from one focused workflow." },
  { name: "Videos", text: "Create short-form video assets alongside your image creative." },
  { name: "Copy", text: "Produce headlines, hooks, CTAs, and ad text variations." },
  { name: "Insights", text: "Use performance data to guide what you create next." },
];

export default function TrustFoundation() {
  return (
    <Section size="md" container="wide" className="adgen-trust-section">
      <SectionHeader
        align="center"
        eyebrow="Connected Workflow"
        title="Consistency without compromise."
        description="Create with confidence knowing every asset stays on brand, organized, and ready for the next campaign."
      />

      <Stagger
        className="adgen-trust-grid"
        childClassName="trust-item"
        delay={110}
      >
        {items.map((item) => (
          <TiltCard
            key={item.name}
            maxTilt={1.2}
            maxMove={2}
          >
            <article className="adgen-trust-card">
              <div className="adgen-trust-icon">✓</div>

              <h3>{item.name}</h3>

              <p>{item.text}</p>
            </article>
          </TiltCard>
        ))}
      </Stagger>
    </Section>
  );
}