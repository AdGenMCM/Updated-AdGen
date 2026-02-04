import React from "react";
import "./Home.css";

export default function Home() {
  return (
    <main className="home-page">
      {/* HERO */}
      <section className="home-hero">
        <div className="home-container">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="hero-pill">AdGen MCM • AI Ad Creative</span>
              <h1 className="hero-title">
                Create scroll-stopping ads in minutes — not days.
              </h1>
              <p className="hero-subtitle">
                Generate ad copy and visuals fast, iterate with confidence, and launch campaigns with
                creative that’s built to drive clicks and traffic.
              </p>

              <div className="hero-ctas">
                <a className="btn primary" href="/subscribe">
                  Create account / Log in
                </a>
                <a className="btn" href="/pricing">
                  View pricing
                </a>
              </div>

              <div className="hero-proof">
                <div className="proof-item">
                  <div className="proof-value">4</div>
                  <div className="proof-label">plans</div>
                </div>
                <div className="proof-item">
                  <div className="proof-value">AI</div>
                  <div className="proof-label">copy + images</div>
                </div>
                <div className="proof-item">
                  <div className="proof-value">Fast</div>
                  <div className="proof-label">iterations</div>
                </div>
              </div>
            </div>

            <div className="hero-card">
              <div className="mock-header">
                <div className="dot red" />
                <div className="dot yellow" />
                <div className="dot green" />
                <span className="mock-title">Ad Generator</span>
              </div>

              <div className="mock-body">
                <div className="mock-row">
                  <span className="mock-label">Product</span>
                  <div className="mock-chip">Fitness App</div>
                </div>
                <div className="mock-row">
                  <span className="mock-label">Goal</span>
                  <div className="mock-chip">Clicks + Traffic</div>
                </div>
                <div className="mock-row">
                  <span className="mock-label">Audience</span>
                  <div className="mock-chip">Busy professionals</div>
                </div>

                <div className="mock-output">
                  <div className="mock-output-title">Generated Headline</div>
                  <div className="mock-output-text">
                    “Work out smarter — 20 minutes a day to feel better, stronger, and more confident.”
                  </div>
                </div>

                <div className="mock-actions">
                  <button type="button" className="mock-btn">
                    Regenerate
                  </button>
                  <button type="button" className="mock-btn primary">
                    Generate Ad
                  </button>
                </div>

                <p className="mock-note">
                  Tip: Create variations and test what wins.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="home-strip">
        <div className="home-container strip-inner">
          <div className="strip-item">✅ Fast ad variations</div>
          <div className="strip-item">✅ Built for performance marketers</div>
          <div className="strip-item">✅ Simple monthly plans</div>
          <div className="strip-item">✅ Meta campaign setup available</div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="home-section">
        <div className="home-container">
          <h2 className="section-title">Everything you need to ship better creative</h2>
          <p className="section-subtitle">
            Generate, edit, and iterate — without bouncing between tools.
          </p>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>AI copy that sounds human</h3>
              <p>
                Generate hooks, headlines, primary text, and CTAs — then tweak it in the editor to
                match your brand voice.
              </p>
            </div>

            <div className="feature-card">
              <h3>AI visuals for fast testing</h3>
              <p>
                Create multiple image directions quickly so you can test creative angles and find a
                winner faster.
              </p>
            </div>

            <div className="feature-card">
              <h3>Made for iteration</h3>
              <p>
                Produce variations in minutes and keep your best ideas in your generation history for
                easy reuse.
              </p>
            </div>

            <div className="feature-card">
              <h3>Meta campaign setup (optional)</h3>
              <p>
                Want it done-for-you? We’ll set up a Meta campaign optimized for engagement, clicks,
                and traffic to your landing page.
              </p>
              <a className="text-link" href="/pricing">See details →</a>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">How it works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div>
                <h3>Describe your offer</h3>
                <p>Tell us what you’re selling, who it’s for, and what you want to achieve.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div>
                <h3>Generate variations</h3>
                <p>Get multiple creative angles for hooks, copy, and visuals.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <h3>Edit & launch</h3>
                <p>Refine in the editor and publish to your landing page or campaign workflow.</p>
              </div>
            </div>
          </div>

          <div className="center-cta">
            <a className="btn primary" href="/pricing">Choose a plan</a>
            <a className="btn" href="/about">Learn more</a>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="home-cta">
        <div className="home-container cta-inner">
          <div>
            <h2 className="cta-title">Ready to create your next winning ad?</h2>
            <p className="cta-subtitle">
              Start with a plan that matches your usage. Upgrade anytime.
            </p>
          </div>
          <div className="cta-actions">
            <a className="btn primary" href="/subscribe">Get started</a>
            <a className="btn" href="/pricing">View pricing</a>
          </div>
        </div>
      </section>
    </main>
  );
}
