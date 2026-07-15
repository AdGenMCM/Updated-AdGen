import React from "react";
import "./Platform.css";

import Section from "../components/marketing/layout/Section";
import MarketingButton from "../components/marketing/actions/MarketingButton";
import ProductCanvas from "../components/marketing/ProductCanvas";
import ProductMomentCard from "../components/marketing/ProductMomentCard";
import ParallaxCard from "../components/motion/ParallaxCard";
import Reveal from "../components/motion/Reveal";

const sections = [
  {
    number: "01",
    eyebrow: "BRAND KIT",
    title: "Start with your brand.",
    outcome: "Create once. Stay consistent everywhere.",
    text:
      "Define the identity, voice, audience, and creative rules that guide every image, video, and campaign asset generated inside AdGen.",
    points: [
      "Upload your logo and brand assets",
      "Define colors, fonts, voice, and audience",
      "Set default creative preferences",
      "Apply your Brand Kit across generators",
    ],
    image: "/screenshots/brand-kit.png",
    imageAlt:
      "AdGen MCM Brand Kit showing brand strategy, colors, typography, logo, and a live brand preview",
    callouts: ["Brand identity", "Creative rules", "Live preview"],
    featured: true,
    visualTone: "violet",
  },
  {
    number: "02",
    eyebrow: "IMAGE GENERATION",
    title: "Turn ideas into campaign-ready creative.",
    outcome: "Go from campaign brief to polished ad creative.",
    text:
      "Create branded image ads, strategic copy, hooks, calls to action, and multiple creative directions from one connected workflow.",
    points: [
      "Generate brand-aware image ads",
      "Create campaign copy and hooks",
      "Use references for stronger visual guidance",
      "Produce multiple formats and variations",
    ],
    image: "/screenshots/image-generator.png",
    imageAlt:
      "AdGen MCM Image Generator showing campaign inputs, Brand Kit defaults, audience controls, and generated creative",
    callouts: ["Brand-aware", "Reference guided", "Multi-format"],
    reverse: true,
    visualTone: "blue",
  },
  {
    number: "03",
    eyebrow: "VIDEO GENERATION",
    title: "Create motion without the production bottleneck.",
    outcome: "Build campaign-ready video without a full production team.",
    text:
      "Turn written prompts or existing images into short-form video ads with brand context, flexible formats, voiceover, and creative direction.",
    points: [
      "Prompt-to-video generation",
      "Image-to-video generation",
      "Flexible durations and vertical formats",
      "Voiceover and audio workflows",
    ],
    image: "/screenshots/video-generator.png",
    imageAlt:
      "AdGen MCM Video Generator showing prompt-to-video settings, Brand Kit controls, voiceover, duration, and format options",
    callouts: ["Prompt to video", "Voiceover", "Vertical formats"],
    visualTone: "violet",
  },
  {
    number: "04",
    eyebrow: "CREATIVE OPTIMIZER",
    title: "Improve what is not working.",
    outcome: "Turn performance problems into stronger creative direction.",
    text:
      "Analyze an existing ad alongside its campaign context and performance metrics to identify weaknesses and generate stronger recommendations.",
    points: [
      "Diagnose likely creative weaknesses",
      "Receive actionable recommendations",
      "Generate improved campaign copy",
      "Create stronger visual directions",
    ],
    image: "/screenshots/optimizer.png",
    imageAlt:
      "AdGen MCM Creative Optimizer showing campaign context, performance inputs, audience temperature, and analysis guidance",
    callouts: ["Performance diagnosis", "Action plan", "Stronger variants"],
    reverse: true,
    visualTone: "blue",
  },
  {
    number: "05",
    eyebrow: "CREATIVE LIBRARY",
    title: "Keep every creative organized.",
    outcome: "Your complete creative history in one searchable workspace.",
    text:
      "Store generated images and videos alongside campaign context, performance data, winner labels, and creative history.",
    points: [
      "Organize image and video assets",
      "Search and filter creative history",
      "Track performance on individual assets",
      "Mark successful creative as winners",
    ],
    image: "/screenshots/creative-library.png",
    imageAlt:
      "AdGen MCM Creative Library showing generated image assets, video counts, performance tracking, filters, and winner labels",
    callouts: ["Searchable assets", "Performance data", "Winner tracking"],
    visualTone: "violet",
  },
  {
    number: "06",
    eyebrow: "INSIGHTS",
    title: "Turn campaign results into smarter creative decisions.",
    outcome: "Use past performance to guide what you create next.",
    text:
      "Identify winning patterns across tracked creative and use those signals to make future campaign assets more focused and effective.",
    points: [
      "Track CTR, CPA, ROAS, and CPM",
      "Identify winning creative patterns",
      "Surface recommended next actions",
      "Guide future generation with performance data",
    ],
    image: "/screenshots/insights.png",
    imageAlt:
      "AdGen MCM Insights showing performance sources, creative intelligence score, weighted ROAS, CTR, and tracked creative",
    callouts: ["Creative intelligence", "Winner patterns", "Next actions"],
    reverse: true,
    visualTone: "blue",
  },
  {
    number: "07",
    eyebrow: "CREATIVE STUDIO",
    title: "Perfect every creative before launch.",
    outcome: "Make final edits without leaving the platform.",
    text:
      "Refine generated assets with editable text, positioning controls, safe-area guides, font styling, and export-ready files.",
    points: [
      "Add and edit text layers",
      "Use platform-safe layout guides",
      "Adjust typography and alignment",
      "Export polished PNG creative",
    ],
    image: "/screenshots/creative-studio.png",
    imageAlt:
      "AdGen MCM Creative Studio showing a skincare ad canvas, editable text, typography controls, safe-area guides, and PNG export",
    callouts: ["Editable layers", "Safe-area guides", "Export ready"],
    featured: true,
    visualTone: "violet",
  },
];



const imageExamples = [
  {
    src: "/examples/imagegen/image-ex1.png",
    alt: "BaseBall University PowerBat campaign creative generated with AdGen MCM",
    title: "Sports equipment",
    detail: "Bold product campaign • Square format",
    format: "square",
  },
  {
    src: "/examples/imagegen/image-ex3.png",
    alt: "Air Fresh household product campaign creative generated with AdGen MCM",
    title: "Consumer goods",
    detail: "Clean product campaign • Landscape format",
    format: "landscape",
  },
  {
    src: "/examples/imagegen/image-ex2.png",
    alt: "Lumière vitamin C skincare campaign creative generated with AdGen MCM",
    title: "Skincare",
    detail: "Premium beauty campaign • Square format",
    format: "square",
  },
];

function GeneratedImageExamples() {
  return (
    <section className="platform-output-showcase platform-output-showcase-images">
      <div className="platform-container platform-output-container">
        <div className="platform-output-header">
          <span className="platform-output-badge">Real platform output</span>
          <h3>See what AdGen MCM creates.</h3>
          <p>
            Every creative below was generated inside AdGen MCM using the same
            image workflow available to customers.
          </p>
        </div>

        <div className="platform-output-grid">
          {imageExamples.map((example) => (
            <article
              className={`platform-output-card platform-output-card-${example.format}`}
              key={example.title}
            >
              <div className={`platform-output-media platform-output-media-${example.format}`}>
                <img
                  src={example.src}
                  alt={example.alt}
                  loading="lazy"
                  decoding="async"
                />
                <span className="platform-output-watermark">Generated with AdGen MCM</span>
              </div>

              <div className="platform-output-card-copy">
                <h4>{example.title}</h4>
                <p>{example.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function GeneratedVideoExample() {
  return (
    <section className="platform-output-showcase platform-output-showcase-video">
      <div className="platform-container platform-video-example-grid">
        <div className="platform-output-header platform-output-header-left">
          <span className="platform-output-badge">Real platform output</span>
          <h3>From prompt to polished motion.</h3>
          <p>
            A cinematic product video generated inside AdGen MCM from a short
            creative direction—without a traditional production workflow.
          </p>

          <div className="platform-video-prompt">
            <span>Example direction</span>
            <p>
              Cinematic energy drink product commercial with dramatic lighting,
              premium motion, and a high-impact studio atmosphere.
            </p>
          </div>
        </div>

        <div className="platform-video-frame">
          <div className="platform-video-glow" aria-hidden="true" />
          <video
            className="platform-generated-video"
            src="/examples/videogen/video-ex1.mp4"
            controls
            playsInline
            preload="none"
            aria-label="Energy drink product video generated with AdGen MCM"
          >
            Your browser does not support embedded video.
          </video>
          <span className="platform-video-label">Generated with AdGen MCM</span>
        </div>
      </div>
    </section>
  );
}

function ScreenshotCallouts({ items }) {
  return (
    <div
      className="platform-screenshot-callouts"
      aria-label="Highlighted capabilities"
    >
      {items.map((item, index) => (
        <span
          key={item}
          className={`platform-screenshot-callout callout-${index + 1}`}
        >
          <i aria-hidden="true" />
          {item}
        </span>
      ))}
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
            Build your brand foundation, generate image and video creative,
            refine campaigns, track performance, and turn results into stronger
            future work—all inside one connected platform.
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
              src="/screenshots/dashboard.png"
              alt="AdGen MCM dashboard showing image usage, video usage, Brand Kit status, current plan, and quick creative actions"
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
                    title="Video ready"
                    detail="Campaign-ready motion creative"
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
          <span>Image, video, and copy</span>
          <i />
          <span>Optimization and insights</span>
        </div>
      </Section>

      <section className="platform-story-intro">
        <div className="platform-container">
          <Reveal>
            <div className="platform-story-intro-inner">
              <span className="platform-story-intro-label">
                One connected workflow
              </span>

              <h2>
                Every campaign begins with your brand and becomes smarter with
                every result.
              </h2>

              <p>
                AdGen connects creation, refinement, organization, and
                performance so each stage of your workflow strengthens the
                next.
              </p>

              <div
                className="platform-story-steps"
                aria-label="AdGen platform workflow"
              >
                <span>Define</span>
                <i aria-hidden="true" />
                <span>Generate</span>
                <i aria-hidden="true" />
                <span>Refine</span>
                <i aria-hidden="true" />
                <span>Measure</span>
                <i aria-hidden="true" />
                <span>Improve</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="platform-product-story">
        {sections.map((section, index) => (
          <React.Fragment key={section.title}>
            <Reveal>
              <section
              className={[
                "platform-showcase",
                section.reverse ? "reverse" : "",
                section.featured ? "featured" : "",
                `tone-${section.visualTone}`,
              ]
                .filter(Boolean)
                .join(" ")}
              data-section-number={section.number}
            >
              <div className="platform-showcase-light" aria-hidden="true" />

              <div className="platform-container platform-showcase-grid">
                <div className="platform-showcase-copy">
                  <div className="platform-showcase-meta">
                    <span className="platform-section-number">
                      {section.number}
                    </span>

                    <span className="platform-pill">
                      {section.eyebrow}
                    </span>
                  </div>

                  <h2>{section.title}</h2>

                  <p className="platform-showcase-outcome">
                    {section.outcome}
                  </p>

                  <p className="platform-showcase-description">
                    {section.text}
                  </p>

                  <ul>
                    {section.points.map((point) => (
                      <li key={point}>
                        <span aria-hidden="true">✓</span>
                        {point}
                      </li>
                    ))}
                  </ul>

                  <div className="platform-showcase-progress">
                    <span>
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div>
                      <i
                        style={{
                          width: `${
                            ((index + 1) / sections.length) * 100
                          }%`,
                        }}
                      />
                    </div>

                    <span>
                      {String(sections.length).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div className="platform-showcase-visual">
                  <div className="platform-screenshot-shell">
                    <div className="platform-screenshot-glow" />

                    <div className="platform-screenshot-frame">
                      <img
                        src={section.image}
                        alt={section.imageAlt}
                        className="platform-screenshot"
                        loading="lazy"
                        decoding="async"
                      />

                      <div
                        className="platform-screenshot-shine"
                        aria-hidden="true"
                      />
                    </div>

                    <ScreenshotCallouts items={section.callouts} />
                  </div>
                </div>
              </div>
              </section>
            </Reveal>

            {section.number === "02" && (
              <Reveal>
                <GeneratedImageExamples />
              </Reveal>
            )}

            {section.number === "03" && (
              <Reveal>
                <GeneratedVideoExample />
              </Reveal>
            )}
          </React.Fragment>
        ))}
      </div>

      <section className="platform-final">
        <div className="platform-container platform-final-inner">
          <Reveal>
            <div className="platform-final-content">
              <span className="platform-pill">
                Ready to build better ads?
              </span>

              <h2>
                Bring your entire creative workflow into one platform.
              </h2>

              <p>
                Generate branded image ads, video creative, campaign copy,
                optimized variations, organized assets, and performance-guided
                insights without stitching together separate tools.
              </p>

              <div className="platform-final-proof">
                <span>
                  <i aria-hidden="true" />
                  Brand-aware creative
                </span>

                <span>
                  <i aria-hidden="true" />
                  Image and video generation
                </span>

                <span>
                  <i aria-hidden="true" />
                  Performance-guided improvement
                </span>
              </div>

              <div className="platform-final-actions">
                <MarketingButton
                  href="/subscribe"
                  size="lg"
                  className="platform-final-primary"
                >
                  Start creating
                </MarketingButton>

                <MarketingButton
                  href="/pricing"
                  size="lg"
                  variant="secondary"
                  className="platform-final-secondary"
                >
                  View pricing
                </MarketingButton>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}