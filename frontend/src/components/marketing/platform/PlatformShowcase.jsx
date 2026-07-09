import React from "react";
import "./PlatformShowcase.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";

const highlights = [
  {
    label: "Brand Foundation",
    title: "Every creative starts on brand.",
    text: "Apply your logo, colors, fonts, and creative direction before anything is generated.",
  },
  {
    label: "Create Faster",
    title: "Images, videos, and copy together.",
    text: "Move from first draft to polished campaign assets without switching tools.",
  },
  {
    label: "Creative Library",
    title: "Everything stays organized.",
    text: "Save, review, and reuse every version from one connected workspace.",
  },
  {
    label: "Performance Loop",
    title: "Improve every next creative.",
    text: "Use insights and optimization to understand what works and generate stronger ads.",
  },
];

export default function PlatformShowcase() {
  return (
    <Section size="lg" container="wide" className="adgen-platform-section">
      <SectionHeader
        align="center"
        eyebrow="Platform"
        title="Every creative tool. One workspace."
        description="Brand, generation, editing, organization, and optimization work together so your team can move faster without losing consistency."
      />

      <div className="adgen-platform-showcase">
        <div className="adgen-platform-window">
          <aside className="adgen-platform-sidebar">
            <div className="adgen-platform-logo">AdGen</div>

            <div className="adgen-platform-nav">
              <span className="active">Overview</span>
              <span>Brand Kit</span>
              <span>Generator</span>
              <span>Video Ads</span>
              <span>Studio</span>
              <span>Library</span>
              <span>Insights</span>
            </div>
          </aside>

          <main className="adgen-platform-main">
            <header className="adgen-platform-top">
              <div>
                <p>Creative Workspace</p>
                <h3>Campaign-ready assets</h3>
              </div>

              <button type="button">Generate</button>
            </header>

            <div className="adgen-platform-grid">
              <div className="adgen-platform-card brand">
                <span>Brand Kit</span>
                <strong>Brand applied</strong>
                <small>Logo, colors, and fonts synced</small>
              </div>

              <div className="adgen-platform-card metric">
                <span>Best CTR</span>
                <strong>4.8%</strong>
                <small>Meta campaign</small>
              </div>

              <div className="adgen-platform-card video">
                <span>Video</span>
                <strong>Ready</strong>
                <small>6-second ad exported</small>
              </div>

              <div className="adgen-platform-card creative">
                <div className="adgen-platform-creative-art" />
                <div>
                  <span>Generated Creative</span>
                  <strong>Premium product ad</strong>
                  <small>Built with Brand Kit</small>
                </div>
              </div>

              <div className="adgen-platform-card library">
                <span>Library</span>
                <strong>128 assets</strong>
                <small>Images, videos, and copy organized</small>
              </div>

              <div className="adgen-platform-card optimizer">
                <span>Optimizer</span>
                <strong>Winner found</strong>
                <small>Top-performing creative identified</small>
              </div>
            </div>
          </main>
        </div>
        <div className="adgen-platform-highlights">
          {highlights.map((item) => (
            <article key={item.label}>
              <p>{item.label}</p>
              <h3>{item.title}</h3>
              <span>{item.text}</span>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}