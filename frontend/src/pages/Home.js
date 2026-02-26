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
              <span className="hero-pill">AdGen MCM • Creative Iteration for Paid Advertisers</span>

              <h1 className="hero-title">
                Your ads aren’t failing. Your creative is.
              </h1>

              <p className="hero-subtitle">
                When CTR drops and CPA rises, it’s usually creative fatigue. 
                AdGen MCM helps you generate fresh, test-ready ad variations in minutes —
                so performance stays stable.
              </p>

              <div className="hero-ctas">
                <a className="btn primary" href="/subscribe">
                  Create Account / Log In
                </a>
                <a className="btn" href="/pricing">
                  View Pricing
                </a>
              </div>

              <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                Cancel anytime. No contracts. Secure payments via Stripe.
              </p>

              <div className="hero-proof">
                <div className="proof-item">
                  <div className="proof-value">10+</div>
                  <div className="proof-label">angles in minutes</div>
                </div>
                <div className="proof-item">
                  <div className="proof-value">Copy</div>
                  <div className="proof-label">hooks + CTAs</div>
                </div>
                <div className="proof-item">
                  <div className="proof-value">Visuals</div>
                  <div className="proof-label">ready to test</div>
                </div>
              </div>
            </div>

            {/* Mock UI */}
            <div className="hero-card">
              <div className="mock-header">
                <div className="dot red" />
                <div className="dot yellow" />
                <div className="dot green" />
                <span className="mock-title">Ad Generator</span>
              </div>

              <div className="mock-body">
                <div className="mock-row">
                  <span className="mock-label">Goal</span>
                  <div className="mock-chip">Conversions</div>
                </div>

                <div className="mock-output">
                  <div className="mock-output-title">Generated Hook</div>
                  <div className="mock-output-text">
                    “Performance slowing down? Refresh your creative before CPA climbs.”
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
                  Tip: generate multiple angles and test what wins.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN SECTION */}
      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">What happens when creative fatigue hits?</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>CTR drops</h3>
              <p>Your audience stops responding to the same creative.</p>
            </div>

            <div className="feature-card">
              <h3>CPC rises</h3>
              <p>You pay more for every click as engagement weakens.</p>
            </div>

            <div className="feature-card">
              <h3>CPA creeps up</h3>
              <p>Costs increase without you changing targeting or budget.</p>
            </div>

            <div className="feature-card">
              <h3>ROAS declines</h3>
              <p>Profit margins shrink because creative isn’t refreshed fast enough.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className="home-section">
        <div className="home-container">
          <h2 className="section-title">Built to refresh creative before performance tanks</h2>
          <p className="section-subtitle">
            Generate hooks, primary text, CTAs, and visuals — then iterate quickly when results dip.
          </p>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>AI copy built for paid ads</h3>
              <p>Hooks, headlines, and CTAs structured specifically for Meta performance.</p>
            </div>

            <div className="feature-card">
              <h3>Fast visual directions</h3>
              <p>Create multiple creative angles so you test ideas — not guesses.</p>
            </div>

            <div className="feature-card">
              <h3>Performance optimizer (Pro+)</h3>
              <p>Upload CTR, CPC, CPA, and get actionable improvement recommendations.</p>
            </div>

            <div className="feature-card">
              <h3>Made for iteration</h3>
              <p>Generate, test, refine, and repeat — without losing your best ideas.</p>
            </div>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">Who this is for</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <p>✅ Ecommerce founders running paid ads</p>
              <p>✅ Solo performance marketers</p>
              <p>✅ Agencies managing multiple offers</p>
              <p>❌ Not for businesses that don’t run paid traffic</p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="home-section">
        <div className="home-container">
          <h2 className="section-title">Trusted by performance-focused advertisers</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <p>
                “Creative fatigue was killing our CTR. I generated 6 new angles in under 15 minutes
                and found a winner within a few days.”
              </p>
              <p style={{ marginTop: 10, fontWeight: 800 }}>
                — Jason M., Ecommerce Founder
              </p>
            </div>

            <div className="feature-card">
              <p>
                “Instead of staring at a blank page, I can spin up variations instantly.
                It’s helped me test more consistently and avoid performance dips.”
              </p>
              <p style={{ marginTop: 10, fontWeight: 800 }}>
                — Sarah K., Paid Media Consultant
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHY NOT CHATGPT */}
      <section className="home-section alt">
        <div className="home-container">
          <h2 className="section-title">Why not just use ChatGPT?</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>Structured for paid ads</h3>
              <p>Prompts are built specifically for performance marketing workflows.</p>
            </div>

            <div className="feature-card">
              <h3>Creative iteration system</h3>
              <p>Generate variations intentionally, not randomly.</p>
            </div>

            <div className="feature-card">
              <h3>Performance optimization</h3>
              <p>Upload metrics and get structured feedback (Pro+).</p>
            </div>

            <div className="feature-card">
              <h3>Saved generation history</h3>
              <p>Keep your best-performing angles organized and reusable.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="home-cta">
        <div className="home-container cta-inner">
          <div>
            <h2 className="cta-title">
              Ready to refresh your creative before CPA climbs?
            </h2>
            <p className="cta-subtitle">
              Choose a plan based on how often you test. Upgrade anytime.
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


