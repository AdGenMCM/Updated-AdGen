import React from "react";
import "./About.css";

import Reveal from "../components/motion/Reveal";
import MarketingButton from "../components/marketing/actions/MarketingButton";

const principles = [
  {
    number: "01",
    title: "Stay close to the customer.",
    text:
      "The best product decisions come from understanding how real businesses create, launch, measure, and improve their advertising.",
  },
  {
    number: "02",
    title: "Make powerful tools feel simple.",
    text:
      "ADGen should remove friction from the creative process—not add another complicated system to manage.",
  },
  {
    number: "03",
    title: "Build for continuity.",
    text:
      "Creative work should carry context forward so teams can build on what they already know.",
  },
  {
    number: "04",
    title: "Earn trust through usefulness.",
    text:
      "Every feature should solve a real problem, improve the workflow, and help customers move with more confidence.",
  },
];

const milestones = [
  {
    label: "Now",
    title: "A connected creative workspace",
    text:
      "Brand identity, image generation, video, editing, optimization, asset management, and performance learning in one place.",
  },
  {
    label: "Next",
    title: "Performance Intelligence in action",
    text:
      "A learning system that turns qualified campaign results into guidance for future image and video generations.",
  },
  {
    label: "Future",
    title: "Creative intelligence that compounds over time",
    text:
      "A system that understands brand context, remembers what performs, and helps every future campaign begin from stronger evidence.",
  },
];

export default function About() {
  return (
    <main className="about-page about-v2">
      <section className="about-v2-hero">
        <div className="about-v2-hero-bg" aria-hidden="true" />

        <div className="about-v2-container about-v2-hero-inner">
          <p className="about-v2-eyebrow">About ADGen MCM</p>

          <h1>
            <span>Building a better way</span>
            <span>to advertise.</span>
          </h1>

          <p className="about-v2-hero-copy">
            ADGen MCM is an independent software company focused on making the
            creative process more connected, more useful, and increasingly informed by
            real campaign performance.
          </p>

          <div className="about-v2-hero-actions">
            <MarketingButton href="/platform" size="lg">
              Explore the platform
            </MarketingButton>

            <MarketingButton href="/contact" size="lg" variant="secondary">
              Contact us
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="about-v2-founder">
        <div className="about-v2-container about-v2-founder-grid">
          <Reveal>
            <div className="about-v2-founder-visual">
              <div className="about-v2-founder-glow" aria-hidden="true" />

              <div className="about-v2-founder-frame">
                <img
                  src="/images/professional-headshot.JPG"
                  alt="Matthew Melio, founder of ADGen MCM"
                  className="about-v2-founder-image"
                  loading="eager"
                  decoding="async"
                />
              </div>

              <div className="about-v2-founder-card">
                <span>Founder</span>
                <strong>Matthew Melio</strong>
                <p>Building ADGen MCM in New York City.</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="about-v2-founder-copy">
              <span className="about-v2-pill">About the founder</span>

              <h2>Hi, I’m Matthew.</h2>

              <p>
                I built ADGen because I was frustrated with how many disconnected
                tools it took to create a single advertising campaign.
              </p>

              <p>
                Images were made in one place. Copy was written somewhere else.
                Video lived in another tool. Performance lived in spreadsheets.
                Every campaign felt like starting over.
              </p>

              <p>
                I wanted to build one workspace where everything stayed connected
                and became more useful over time—where campaign results could
                influence what a business creates next.
              </p>

              <p className="about-v2-founder-emphasis">
                I’m building the kind of creative software I always wished existed.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="about-v2-problem">
        <div className="about-v2-container">
          <Reveal>
            <div className="about-v2-problem-inner">
              <span className="about-v2-pill">What I kept seeing</span>

              <h2>
                The real cost was not the number of tools. It was the context they lost.
              </h2>

              <p className="about-v2-problem-intro">
                The creative process became harder every time important knowledge
                failed to carry forward.
              </p>
            </div>
          </Reveal>

          <div className="about-v2-context-grid">
            {[
              {
                number: "01",
                title: "Brand context reset",
                text:
                  "Teams had to explain the same identity, audience, and creative direction again and again.",
              },
              {
                number: "02",
                title: "Strong ideas disappeared",
                text:
                  "Useful concepts became buried in downloads and folders instead of becoming reusable creative knowledge.",
              },
              {
                number: "03",
                title: "Results stayed isolated",
                text:
                  "Performance data described what happened, but rarely became reusable guidance for what the team created next.",
              },
              {
                number: "04",
                title: "Momentum kept breaking",
                text:
                  "Each campaign required rebuilding the workflow instead of continuing from a stronger starting point.",
              },
            ].map((item, index) => (
              <Reveal key={item.title} delay={index * 80}>
                <article className="about-v2-context-card">
                  <span>{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="about-v2-context-conclusion">
              <span>That became the product opportunity:</span>
              <strong>preserve the knowledge around the creative—and apply it to what comes next.</strong>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="about-v2-principles">
        <div className="about-v2-container">
          <Reveal>
            <div className="about-v2-section-head">
              <span className="about-v2-pill">How we think</span>

              <h2>The principles guiding what ADGen becomes.</h2>

              <p>
                These ideas shape the product, the customer experience, and the
                way the company continues to grow.
              </p>
            </div>
          </Reveal>

          <div className="about-v2-principles-grid">
            {principles.map((principle, index) => (
              <Reveal key={principle.title} delay={index * 90}>
                <article className="about-v2-principle-card">
                  <span className="about-v2-principle-number">
                    {principle.number}
                  </span>

                  <h3>{principle.title}</h3>
                  <p>{principle.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="about-v2-roadmap">
        <div className="about-v2-container about-v2-roadmap-grid">
          <Reveal>
            <div className="about-v2-roadmap-copy">
              <span className="about-v2-pill">What we are building</span>

              <h2>
                A platform designed to preserve creative knowledge.
              </h2>

              <p>
                ADGen brings the core creative workflow together. Performance
                Intelligence adds a learning layer by turning qualified campaign
                results into practical guidance for future generations.
              </p>

              <p>
                The goal is not to replace creative judgment. It is to give
                businesses a system that learns from evidence while keeping the
                marketer in control.
              </p>
            </div>
          </Reveal>

          <div className="about-v2-roadmap-list">
            <div className="about-v2-roadmap-line" aria-hidden="true" />

            {milestones.map((milestone, index) => (
              <Reveal key={milestone.label} delay={index * 100}>
                <article className="about-v2-roadmap-item">
                  <span>{milestone.label}</span>

                  <div>
                    <h3>{milestone.title}</h3>
                    <p>{milestone.text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="about-v2-location">
        <div className="about-v2-container">
          <Reveal>
            <div className="about-v2-location-inner">
              <span className="about-v2-location-mark">NY</span>

              <div>
                <span className="about-v2-pill">Independent and founder-led</span>

                <h2>Built in New York City.</h2>

                <p>
                  ADGen MCM is an independent software company being built with
                  a close connection to its customers, a long-term product
                  vision, and a focus on solving practical creative problems.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="about-v2-final">
        <div className="about-v2-final-light" aria-hidden="true" />

        <div className="about-v2-container about-v2-final-inner">
          <Reveal>
            <span className="about-v2-final-pill">The company behind the platform</span>

            <h2>We’re just getting started.</h2>

            <p>
              ADGen is still early, and that is part of what makes this moment
              exciting. Every customer conversation and real workflow helps shape
              what the platform becomes next.
            </p>

            <div className="about-v2-final-actions">
              <MarketingButton
                href="/subscribe"
                size="lg"
                className="about-v2-final-primary"
              >
                Start creating
              </MarketingButton>

              <MarketingButton
                href="/contact"
                size="lg"
                variant="secondary"
                className="about-v2-final-secondary"
              >
                Contact us
              </MarketingButton>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}



