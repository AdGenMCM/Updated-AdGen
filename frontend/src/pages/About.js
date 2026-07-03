import React from "react";
import "./About.css";

export default function About() {
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-container">
          <span className="about-pill">About AdGen MCM</span>

          <h1 className="about-title">
            AI-powered creative built for modern advertisers.
          </h1>

          <p className="about-subtitle">
            Creating high-performing advertising campaigns should not require
            switching between multiple AI tools, design software, and
            spreadsheets. AdGen MCM brings image generation, video generation,
            copywriting, creative management, and performance optimization into
            one workflow.
          </p>

          <div className="about-ctas">
            <a className="btn primary" href="/subscribe">
              Get Started
            </a>
            <a className="btn" href="/pricing">
              View Pricing
            </a>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="about-container">
          <h2 className="about-h2">Why AdGen exists</h2>
          <p className="about-lead">
            Advertising moves fast. Winning campaigns require constant creative
            testing, but producing enough quality creative has always been
            expensive and time-consuming.
          </p>

          <p className="about-lead">
            AdGen was built to solve that problem. Instead of spending hours
            creating every variation manually, advertisers can generate,
            organize, track, and improve creatives in minutes.
          </p>
        </div>
      </section>

      <section className="about-section alt">
        <div className="about-container">
          <h2 className="about-h2">What you can do with AdGen</h2>

          <div className="about-grid">
            <div className="about-card">
              <div className="about-icon">🎨</div>
              <h3>AI Image Ads</h3>
              <p>
                Generate professional advertising creatives designed for
                testing products, offers, and campaign angles.
              </p>
            </div>

            <div className="about-card">
              <div className="about-icon">🎬</div>
              <h3>AI Video Ads</h3>
              <p>
                Create short-form video ads from prompts or uploaded images,
                with optional AI voiceovers.
              </p>
            </div>

            <div className="about-card">
              <div className="about-icon">✍️</div>
              <h3>AI Ad Copy</h3>
              <p>
                Generate headlines, hooks, primary text, CTAs, and copy
                variations for paid advertising.
              </p>
            </div>

            <div className="about-card">
              <div className="about-icon">📚</div>
              <h3>Creative Library</h3>
              <p>
                Keep generated images and videos organized so your best ideas
                are easy to revisit and reuse.
              </p>
            </div>

            <div className="about-card">
              <div className="about-icon">📈</div>
              <h3>Performance Insights</h3>
              <p>
                Add metrics like CTR, CPC, CPA, CPM, ROAS, spend, and revenue
                to understand what is actually working.
              </p>
            </div>

            <div className="about-card">
              <div className="about-icon">🏆</div>
              <h3>Winners Engine</h3>
              <p>
                Your highest-performing creatives can influence future
                generations, helping AdGen create around proven winning
                patterns.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="about-container">
          <h2 className="about-h2">Built around your creative workflow</h2>

          <div className="about-list">
            <div className="about-row">
              <strong>Create</strong>
              <span>
                Generate image ads, video ads, hooks, copy, and creative
                variations for your product or offer.
              </span>
            </div>

            <div className="about-row">
              <strong>Launch</strong>
              <span>
                Use your creatives across Meta, TikTok, Instagram, Google,
                email, landing pages, or any paid advertising workflow.
              </span>
            </div>

            <div className="about-row">
              <strong>Learn</strong>
              <span>
                Add performance metrics so you can see which creatives, angles,
                formats, and messages are working.
              </span>
            </div>

            <div className="about-row">
              <strong>Improve</strong>
              <span>
                Use what performs best to guide stronger future creative
                generations.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section alt">
        <div className="about-container">
          <h2 className="about-h2">Our vision</h2>

          <p className="about-lead">
            Our vision is simple: help businesses spend less time creating ads
            and more time discovering what works.
          </p>

          <p className="about-lead">
            By combining AI generation with performance insights, AdGen MCM
            helps turn every campaign into a smarter starting point for the next
            one.
          </p>

          <div className="about-bottom-cta">
            <a className="btn primary" href="/subscribe">
              Start Creating
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

