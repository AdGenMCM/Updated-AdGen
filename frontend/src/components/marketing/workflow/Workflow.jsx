import React from "react";
import "./Workflow.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";

const steps = [
  {
    number: "01",
    title: "Brand",
    label: "Start with your identity",
    description:
      "Upload your logo, colors, fonts, and brand details so every creative starts from the same foundation.",
  },
  {
    number: "02",
    title: "Create",
    label: "Generate campaign assets",
    description:
      "Produce images, videos, and ad copy from one connected creative workspace.",
  },
  {
    number: "03",
    title: "Refine",
    label: "Perfect every detail",
    description:
      "Edit, adjust, and improve your creative without jumping between separate tools.",
  },
  {
    number: "04",
    title: "Organize",
    label: "Keep everything together",
    description:
      "Save every creative asset into a library built for reuse, review, and iteration.",
  },
  {
    number: "05",
    title: "Improve",
    label: "Create better work over time",
    description:
      "Use insights and optimization to understand what performs and generate stronger creative next time.",
  },
];

export default function Workflow() {
  return (
    <Section size="lg" container="wide" className="adgen-workflow-section">
      <SectionHeader
        align="center"
        eyebrow="Creative Workflow"
        title="A better way to move creative forward."
        description="Every step from first draft to campaign-ready creative lives in one connected workspace."
      />

      <div className="adgen-workflow">
        <div className="adgen-workflow-line" />

        {steps.map((step, index) => (
          <article
            className="adgen-workflow-step"
            style={{ "--step-delay": `${index * 120}ms` }}
            key={step.title}
          >
            <div className="adgen-workflow-node">
              <span>{step.number}</span>
            </div>

            <div className="adgen-workflow-card">
              <p>{step.title}</p>
              <h3>{step.label}</h3>
              <span>{step.description}</span>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}