import React from "react";
import "./Home.css";

export default function Home() {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-container hero-grid">
          <div className="hero-copy">
            <span className="hero-pill">AI Ad Creative Platform</span>

            <h1 className="hero-title">
              Create better ads. Faster.
            </h1>

            <p className="hero-subtitle">
              Generate high-quality image ads, video ads, copy, and creative
              insights in one platform — then improve future creatives using
              what already performs best.
            </p>

            <div className="hero-ctas">
              <a className="btn primary" href="/subscribe">
                Start Creating
              </a>
              <a className="btn" href="/pricing">
                View Pricing
              </a>
            </div>

            <p className="hero-note">
              No contracts. Cancel anytime. Secure payments through Stripe.
            </p>

            <div className="hero-proof">
              <div className="proof-item">
                <div className="proof-value">Images</div>
                <div className="proof-label">AI ad creatives</div>
              </div>
              <div className="proof-item">
                <div className="proof-value">Videos</div>
                <div className="proof-label">short-form ads</div>
              </div>
              <div className="proof-item">
                <div className="proof-value">Insights</div>
                <div className="proof-label">learn what wins</div>
              </div>
            </div>
          </div>

          <div className="hero-card">
            <div className="mock-header">
              <div className="dot red" />
              <div className="dot yellow" />
              <div className="dot green" />
              <span className="mock-title">AdGen Creative Workflow</span>
            </div>

            <div className="mock-body">
              <div className="mock-row">
                <span className="mock-label">Create</span>
                <div className="mock-chip">Image + Video + Copy</div>
              </div>

              <div className="mock-row">
                <span className="mock-label">Track</span>
                <div className="mock-chip">CTR • CPA • ROAS</div>
              </div>

              <div className="mock-output">
                <div className="mock-output-title">Winners Engine</div>
                <div className="mock-output-text">
                  Your best-performing ads become the creative direction for
                  future generations.
                </div>
              </div>

              <div className="mock-actions">
                <button type="button" className="mock-btn">
                  Analyze Creative
                </button>
                <button type="button" className="mock-btn primary">
                  Generate New Ad
                </button>
              </div>

              <p className="mock-note">
                Create, test, learn, and generate better variations over time.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-strip">
        <div className="home-container strip-inner">
          <span className="strip-item">AI Image Ads</span>
          <span className="strip-item">AI Video Ads</span>
          <span className="strip-item">Ad Copy</span>
          <span className="strip-item">Creative Library</span>
          <span className="strip-item">Performance Insights</span>
          <span className="strip-item">Winners Engine</span>
        </div>
      </section>

      <section className="home-section">
        <div className="home-container">
          <h2 className="section-title">One workflow for better ad creative</h2>
          <p className="section-subtitle">
            AdGen MCM helps you move from idea to usable creative faster —
            without jumping between separate AI tools, editors, and spreadsheets.
          </p>

          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div>
                <h3>Create</h3>
                <p>
                  Generate image ads, video ads, hooks, headlines, CTAs, and
                  copy variations for your product or offer.
                </p>
              </div>
            </div>

            <div className="step">
              <div className="step-num">2</div>
              <div>
                <h3>Launch</h3>
                <p>
                  Use your creatives across Meta, TikTok, Instagram, Google,
                  landing pages, email, or any paid advertising workflow.
                </p>
              </div>
            </div>

            <div className="step">
              <div className="step-num">3</div>
              <div>
                <h3>Improve</h3>
                <p>
                  Track performance, identify winning patterns, and use those
                  insights to guide future creative generations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">Everything you need to create and iterate</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>AI Image Ads</h3>
              <p>
                Generate professional, test-ready ad visuals with styles built
                for paid marketing and ecommerce.
              </p>
            </div>

            <div className="feature-card">
              <h3>AI Video Ads</h3>
              <p>
                Turn prompts or uploaded images into short-form video ads with
                platform-ready formats and optional AI voiceovers.
              </p>
            </div>

            <div className="feature-card">
              <h3>AI Ad Copy</h3>
              <p>
                Create hooks, headlines, primary text, CTAs, and multiple
                variations designed for performance testing.
              </p>
            </div>

            <div className="feature-card">
              <h3>Creative Library</h3>
              <p>
                Save your generated images and videos automatically so you can
                organize, reuse, and compare creative ideas.
              </p>
            </div>

            <div className="feature-card">
              <h3>Performance Insights</h3>
              <p>
                Add metrics like CTR, CPC, CPA, CPM, ROAS, spend, and revenue
                to understand what is actually working.
              </p>
            </div>

            <div className="feature-card">
              <h3>Winners Engine</h3>
              <p>
                Your best-performing ads become your AI creative director,
                helping future generations follow proven winning patterns.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-container">
          <h2 className="section-title">Built for people who need more winning creative</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>Ecommerce founders</h3>
              <p>
                Create product images, videos, and ad copy without waiting on a
                designer or agency.
              </p>
            </div>

            <div className="feature-card">
              <h3>Performance marketers</h3>
              <p>
                Generate fresh angles quickly when CTR drops, CPA rises, or
                campaigns need new tests.
              </p>
            </div>

            <div className="feature-card">
              <h3>Agencies</h3>
              <p>
                Produce more creative options for multiple clients while keeping
                winning ideas organized.
              </p>
            </div>

            <div className="feature-card">
              <h3>Small teams</h3>
              <p>
                Replace scattered tools with one simple workflow for creative
                generation, editing, storage, and optimization.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">Why not just use separate AI tools?</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>Built for advertising</h3>
              <p>
                AdGen is focused on marketing creatives, not generic images,
                random prompts, or one-off AI experiments.
              </p>
            </div>

            <div className="feature-card">
              <h3>Image, video, and copy together</h3>
              <p>
                Generate the creative assets you actually need for campaigns
                from one connected workflow.
              </p>
            </div>

            <div className="feature-card">
              <h3>Performance feedback loop</h3>
              <p>
                Track campaign results and use your own data to guide what
                AdGen creates next.
              </p>
            </div>

            <div className="feature-card">
              <h3>Made for iteration</h3>
              <p>
                Generate, save, compare, optimize, and create again without
                starting from scratch every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-container cta-inner">
          <div>
            <h2 className="cta-title">Ready to create better ads?</h2>
            <p className="cta-subtitle">
              Start generating image ads, video ads, copy, and creative insights
              from one platform.
            </p>
          </div>

          <div className="cta-actions">
            <a className="btn primary" href="/subscribe">
              Get Started
            </a>
            <a className="btn" href="/pricing">
              View Pricing
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

