import React from "react";
import "./Workflow.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";

const steps = [
  {
    number: "01",
    title: "Define",
    label: "Give every campaign a clear foundation",
    description:
      "Set the brand, audience, offer, objective, and creative direction before production begins.",
  },
  {
    number: "02",
    title: "Create",
    label: "Turn direction into campaign assets",
    description:
      "Generate images, videos, copy, hooks, and variations from one focused workflow.",
  },
  {
    number: "03",
    title: "Refine",
    label: "Polish the strongest ideas",
    description:
      "Adjust creative, improve messaging, and prepare each asset for the channel where it will run.",
  },
  {
    number: "04",
    title: "Learn",
    label: "Understand what earns attention",
    description:
      "Track performance, identify winning patterns, and save the creative signals that matter.",
  },
  {
    number: "05",
    title: "Improve",
    label: "Make every next campaign stronger",
    description:
      "Use what worked before as the creative direction for the assets you produce next.",
  },
];

export default function Workflow() {
  return (
    <Section size="lg" container="wide" className="adgen-workflow-section">
      <SectionHeader
        align="center"
        eyebrow="A better creative process"
        title="Move from direction to better-performing creative."
        description="AdGen connects the full creative cycle so your team spends less time coordinating tools and more time improving the work."
      />

      <div className="adgen-workflow">
        <div className="adgen-workflow-line" />

        {steps.map((step, index) => (
          <article
            className="adgen-workflow-step"
            style={{ "--step-delay": `${index * 70}ms` }}
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