import React from "react";
import "./About.css";

export default function About() {
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-container">
          <span className="about-pill">About AdGen MCM</span>
          <h1 className="about-title">We help you launch better ads, faster.</h1>
          <p className="about-subtitle">
            AdGen MCM is built for marketers, founders, and teams who want high-quality ad creative
            without the bottlenecks. Generate copy and visuals in minutes, iterate quickly, and keep
            your momentum.
          </p>

          <div className="about-ctas">
            <a className="btn primary" href="/pricing">View pricing</a>
            <a className="btn" href="/contact">Contact</a>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="about-container">
          <h2 className="about-h2">What we believe</h2>

          <div className="about-grid">
            <div className="about-card">
              <h3>Creative wins campaigns</h3>
              <p>
                Better creative gives you more leverage than minor targeting tweaks. We help you
                generate more angles, faster.
              </p>
            </div>

            <div className="about-card">
              <h3>Iteration beats perfection</h3>
              <p>
                The fastest way to find winners is testing. We make it easy to produce variations
                and learn quickly.
              </p>
            </div>

            <div className="about-card">
              <h3>Simple pricing, real limits</h3>
              <p>
                No confusing credits. Pick a plan with monthly usage that matches your pace.
              </p>
            </div>

            <div className="about-card">
              <h3>Support when you need it</h3>
              <p>
                Need help launching? We also offer a done-for-you Meta campaign setup to drive clicks
                and traffic to your landing page.
              </p>
              <a className="text-link" href="/pricing">See campaign setup →</a>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section alt">
        <div className="about-container">
          <h2 className="about-h2">What AdGen MCM does</h2>

          <div className="about-list">
            <div className="about-row">
              <strong>AI Ad Copy</strong>
              <span>Hooks, headlines, primary text, CTAs, and variations you can edit.</span>
            </div>
            <div className="about-row">
              <strong>AI Images</strong>
              <span>Visual directions for fast testing and iteration.</span>
            </div>
            <div className="about-row">
              <strong>Editor + History</strong>
              <span>Refine outputs and save what works.</span>
            </div>
            <div className="about-row">
              <strong>Meta Campaign Setup</strong>
              <span>Done-for-you setup optimized for engagement, clicks, and traffic.</span>
            </div>
          </div>

          <div className="about-bottom-cta">
            <a className="btn primary" href="/subscribe">Get started</a>
            <a className="btn" href="/pricing">Choose a plan</a>
          </div>
        </div>
      </section>
    </main>
  );
}

