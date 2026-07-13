import React from "react";
import "./Platform.css";

import Section from "../components/marketing/layout/Section";
import MarketingButton from "../components/marketing/actions/MarketingButton";
import ProductCanvas from "../components/marketing/ProductCanvas";
import ProductMomentCard from "../components/marketing/ProductMomentCard";
import ParallaxCard from "../components/motion/ParallaxCard";
import Reveal from "../components/motion/Reveal";


const workflow = [
  [
    "01",
    "Build Your Brand",
    "Set your logo, colors, fonts, tone, and creative rules once.",
  ],
  [
    "02",
    "Generate Creatives",
    "Create image ads, video ads, hooks, copy, and variations.",
  ],
  [
    "03",
    "Refine Designs",
    "Use Creative Studio to polish text, layout, guides, and export.",
  ],
  [
    "04",
    "Optimize",
    "Improve weak creatives and generate stronger versions.",
  ],
  [
    "05",
    "Organize",
    "Keep images, videos, and campaign assets in one Library.",
  ],
  [
    "06",
    "Learn & Improve",
    "Track CTR, CPA, ROAS, and use winners to guide future creative.",
  ],
];

const sections = [
  {
    eyebrow: "BRAND KIT",
    title: "Start with your brand.",
    text: "Upload your logo, define your colors, choose fonts, and give AdGen the creative rules it should follow across every generation.",
    points: [
      "Logo, colors, and fonts",
      "Brand voice and audience",
      "Creative do/don’t rules",
      "Used across generators",
    ],
    mockTitle: "Brand Kit",
  },
  {
    eyebrow: "AI GENERATION",
    title: "Generate better ads faster.",
    text: "Create image ads, video ads, copy, hooks, CTAs, and campaign-ready concepts from one connected creative workflow.",
    points: [
      "AI image ads",
      "AI video ads",
      "Ad copy and hooks",
      "Multiple formats",
    ],
    mockTitle: "Image + Video Generator",
    reverse: true,
  },
  {
    eyebrow: "CREATIVE STUDIO",
    title: "Perfect every creative before launch.",
    text: "Refine AI-generated assets without jumping into another design tool. Add text, adjust layout, use platform guides, and export polished PNGs.",
    points: [
      "Text presets",
      "Safe-area guides",
      "Layout editing",
      "Export-ready creatives",
    ],
    mockTitle: "Creative Studio",
  },
  {
    eyebrow: "OPTIMIZER + INSIGHTS",
    title: "Learn what works and improve what doesn’t.",
    text: "Track performance, identify winning patterns, and use your best creatives to guide stronger future generations.",
    points: [
      "CTR, CPA, ROAS tracking",
      "AI recommendations",
      "Winner patterns",
      "Better future creative",
    ],
    mockTitle: "Insights + Optimizer",
    reverse: true,
  },
  {
    eyebrow: "LIBRARY",
    title: "Keep every creative organized.",
    text: "Your generated images, videos, edits, and performance data stay organized in one place so your best ideas are easy to find and reuse.",
    points: [
      "Image library",
      "Video library",
      "Performance fields",
      "Creative history",
    ],
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
    <main className="platform-page platform-v2">
      <Section
        size="xl"
        container="wide"
        align="center"
        className="platform-v2-hero"
      >
        <div className="platform-v2-hero-bg" />

        <div className="platform-v2-hero-content">
          <p className="platform-v2-eyebrow">Platform</p>

          <h1>
            <span className="platform-v2-line platform-v2-line-primary">
              Explore the complete
            </span>

            <span className="platform-v2-line platform-v2-line-secondary">
              creative workspace.
            </span>
          </h1>

          <p className="platform-v2-description">
            From Brand Kit to image and video generation, creative editing,
            optimization, performance tracking, and insights—every part of your
            workflow lives in one connected platform.
          </p>

          <div className="platform-v2-actions">
            <MarketingButton href="/subscribe" size="lg">
              Start creating
            </MarketingButton>

            <MarketingButton
              href="/pricing"
              size="lg"
              variant="secondary"
            >
              View pricing
            </MarketingButton>
          </div>
        </div>

        <div className="platform-v2-hero-visual">
          <ParallaxCard>
            <ProductCanvas
              src="/dashboard.png"
              alt="AdGen MCM creative platform dashboard"
              variant="hero"
              className="platform-v2-dashboard-canvas"
              floatingCards={
                <>
                  <ProductMomentCard
                    position="top-left"
                    status="success"
                    icon="brand"
                    eyebrow="Brand Kit"
                    title="Brand ready"
                    detail="Colors, fonts, and voice connected"
                  />

                  <ProductMomentCard
                    position="top-right"
                    status="active"
                    icon="spark"
                    eyebrow="Generation"
                    title="Creative workflow"
                    detail="Images, video, and copy in one place"
                  />

                  <ProductMomentCard
                    position="bottom-left"
                    status="insight"
                    icon="chart"
                    eyebrow="Optimizer"
                    title="Performance guided"
                    detail="Turn campaign data into stronger creative"
                  />

                  <ProductMomentCard
                    position="bottom-right"
                    status="video"
                    icon="video"
                    eyebrow="Video"
                    title="Runway powered"
                    detail="Campaign-ready video generation"
                  />
                </>
              }
            />
          </ParallaxCard>
        </div>

        <div
          className="platform-v2-capabilities"
          aria-label="Platform capabilities"
        >
          <span>Brand-aware generation</span>
          <i />
          <span>Images + video + copy</span>
          <i />
          <span>Optimization + insights</span>
        </div>
      </Section>

      <Reveal>
        <section className="platform-section">
          <div className="platform-container">
            <div className="platform-section-head">
              <span className="platform-pill">The Workflow</span>

              <h2>From brand to better-performing ads.</h2>

              <p>
                AdGen connects the entire creative lifecycle, so every campaign
                becomes a smarter starting point for the next one.
              </p>
            </div>

            <div className="platform-workflow">
              {workflow.map(([num, title, text]) => (
                <div
                  className="platform-step hover-lift"
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
      </Reveal>

      {sections.map((section) => (
        <Reveal key={section.title} delay={100}>
          <section
            className={`platform-showcase ${
              section.reverse ? "reverse" : ""
            }`}
          >
            <div className="platform-container platform-showcase-grid">
              <div className="platform-showcase-copy">
                <span className="platform-pill">
                  {section.eyebrow}
                </span>

                <h2>{section.title}</h2>

                <p>{section.text}</p>

                <ul>
                  {section.points.map((point) => (
                    <li key={point}>✓ {point}</li>
                  ))}
                </ul>
              </div>

              <ProductMock title={section.mockTitle} />
            </div>
          </section>
        </Reveal>
      ))}

      <section className="platform-final">
        <div className="platform-container platform-final-inner">
          <span className="platform-pill">
            Ready to build better ads?
          </span>

          <h2>
            Everything you’ve seen is available inside AdGen.
          </h2>

          <p>
            Start creating image ads, video ads, edited creatives,
            performance insights, and optimized variations from one
            platform.
          </p>

          <div className="platform-ctas">
            <a
              className="platform-btn primary"
              href="/subscribe"
            >
              Start Creating
            </a>

            <a
              className="platform-btn"
              href="/pricing"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}