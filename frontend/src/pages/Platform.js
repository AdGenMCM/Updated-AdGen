import React from "react";
import "./Platform.css";

const workflow = [
  ["01", "Build Your Brand", "Set your logo, colors, fonts, tone, and creative rules once."],
  ["02", "Generate Creatives", "Create image ads, video ads, hooks, copy, and variations."],
  ["03", "Refine Designs", "Use Creative Studio to polish text, layout, guides, and export."],
  ["04", "Optimize", "Improve weak creatives and generate stronger versions."],
  ["05", "Organize", "Keep images, videos, and campaign assets in one Library."],
  ["06", "Learn & Improve", "Track CTR, CPA, ROAS, and use winners to guide future creative."],
];

const sections = [
  {
    eyebrow: "BRAND KIT",
    title: "Start with your brand.",
    text: "Upload your logo, define your colors, choose fonts, and give AdGen the creative rules it should follow across every generation.",
    points: ["Logo, colors, and fonts", "Brand voice and audience", "Creative do/don’t rules", "Used across generators"],
    mockTitle: "Brand Kit",
  },
  {
    eyebrow: "AI GENERATION",
    title: "Generate better ads faster.",
    text: "Create image ads, video ads, copy, hooks, CTAs, and campaign-ready concepts from one connected creative workflow.",
    points: ["AI image ads", "AI video ads", "Ad copy and hooks", "Multiple formats"],
    mockTitle: "Image + Video Generator",
    reverse: true,
  },
  {
    eyebrow: "CREATIVE STUDIO",
    title: "Perfect every creative before launch.",
    text: "Refine AI-generated assets without jumping into another design tool. Add text, adjust layout, use platform guides, and export polished PNGs.",
    points: ["Text presets", "Safe-area guides", "Layout editing", "Export-ready creatives"],
    mockTitle: "Creative Studio",
  },
  {
    eyebrow: "OPTIMIZER + INSIGHTS",
    title: "Learn what works and improve what doesn’t.",
    text: "Track performance, identify winning patterns, and use your best creatives to guide stronger future generations.",
    points: ["CTR, CPA, ROAS tracking", "AI recommendations", "Winner patterns", "Better future creative"],
    mockTitle: "Insights + Optimizer",
    reverse: true,
  },
  {
    eyebrow: "LIBRARY",
    title: "Keep every creative organized.",
    text: "Your generated images, videos, edits, and performance data stay organized in one place so your best ideas are easy to find and reuse.",
    points: ["Image library", "Video library", "Performance fields", "Creative history"],
    mockTitle: "Creative Library",
  },
];

function ProductMock({ title }) {
  return (
    <div className="platform-mock hover-lift">
      <div className="platform-mock-top">
        <span />
        <span />
        <span />
        <strong>{title}</strong>
      </div>

      <div className="platform-mock-body">
        <div className="platform-mock-sidebar">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="platform-mock-main">
          <div className="platform-mock-hero" />
          <div className="platform-mock-grid">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="platform-mock-wide" />
        </div>
      </div>
    </div>
  );
}

export default function Platform() {
  return (
    <main className="platform-page">
      <section className="platform-hero">
        <div className="platform-container platform-hero-grid">
          <div className="platform-hero-copy animate-fade-up">
            <span className="platform-pill">Explore the AdGen Platform</span>

            <h1>One platform. Every step of your creative workflow.</h1>

            <p>
              Create, refine, optimize, organize, and improve high-performing
              advertising creatives from one unified AI workspace.
            </p>

            <div className="platform-ctas">
              <a className="platform-btn primary" href="/subscribe">
                Start Creating
              </a>
              <a className="platform-btn" href="/pricing">
                View Pricing
              </a>
            </div>
          </div>

          <div className="animate-fade-up animate-delay-2">
            <ProductMock title="AdGen Dashboard" />
          </div>
        </div>
      </section>

      <section className="platform-section">
        <div className="platform-container">
          <div className="platform-section-head animate-fade-up">
            <span className="platform-pill">The Workflow</span>
            <h2>From brand to better-performing ads.</h2>
            <p>
              AdGen connects the entire creative lifecycle, so every campaign
              becomes a smarter starting point for the next one.
            </p>
          </div>

          <div className="platform-workflow">
            {workflow.map(([num, title, text], index) => (
              <div
                className={`platform-step hover-lift animate-fade-up animate-delay-${Math.min(index + 1, 4)}`}
                key={title}
              >
                <div className="platform-step-num">{num}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {sections.map((section, index) => (
        <section
          className={`platform-showcase ${section.reverse ? "reverse" : ""}`}
          key={section.title}
        >
          <div className="platform-container platform-showcase-grid">
            <div className="platform-showcase-copy animate-fade-up">
              <span className="platform-pill">{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <p>{section.text}</p>

              <ul>
                {section.points.map((point) => (
                  <li key={point}>✓ {point}</li>
                ))}
              </ul>
            </div>

            <div className="animate-fade-up animate-delay-2">
              <ProductMock title={section.mockTitle} />
            </div>
          </div>
        </section>
      ))}

      <section className="platform-final">
        <div className="platform-container platform-final-inner animate-fade-up">
          <span className="platform-pill">Ready to build better ads?</span>
          <h2>Everything you’ve seen is available inside AdGen.</h2>
          <p>
            Start creating image ads, video ads, edited creatives, performance
            insights, and optimized variations from one platform.
          </p>

          <div className="platform-ctas">
            <a className="platform-btn primary" href="/subscribe">
              Start Creating
            </a>
            <a className="platform-btn" href="/pricing">
              View Pricing
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}