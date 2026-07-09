import React, { useEffect, useRef, useState } from "react";
import "./ResultsSection.css";

import Section from "../layout/Section";
import SectionHeader from "../typography/SectionHeader";
import TiltCard from "../../motion/TiltCard";

const metrics = [
  {
    value: "+18%",
    title: "Higher CTR",
    text: "Top creative identified and reused automatically.",
  },
  {
    value: "Winner",
    title: "Creative Library",
    text: "Every version stays organized for future campaigns.",
  },
  {
    value: "Brand",
    title: "Always Consistent",
    text: "Brand Kit keeps every asset aligned.",
  },
  {
    value: "Loop",
    title: "Continuous Learning",
    text: "Every campaign becomes the starting point for the next.",
  },
];

export default function ResultsSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <Section
      size="lg"
      container="wide"
      className={`adgen-results-section ${visible ? "is-visible" : ""}`}
    >
      <div ref={ref} className="adgen-results-trigger">
        <div className="adgen-results-layout">
          <div className="adgen-results-copy">
            <SectionHeader
              align="left"
              eyebrow="Performance"
              title="Every campaign makes the next one stronger."
              description="Performance isn't the end of the workflow. Learn what performs, organize every creative, and generate smarter campaigns every time."
            />

            <div className="adgen-results-grid">
              {metrics.map((item) => (
              <TiltCard
                key={item.title}
                maxTilt={1.2}
                maxMove={2}
              >
                <article className="adgen-result-card">
                  <span>{item.value}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              </TiltCard>
              ))}
            </div>
          </div>

          <div className="adgen-results-visual">
            <div className="results-dashboard">
              <div className="results-dashboard-top">
                <div>
                  <p>Creative Performance</p>
                  <h3>Winner profile</h3>
                </div>

                <div className="results-badge">Live insights</div>
              </div>

              <div className="results-stats-row">
                <div>
                  <span>CTR lift</span>
                  <strong>+18%</strong>
                </div>

                <div>
                  <span>Best style</span>
                  <strong>Lifestyle</strong>
                </div>

                <div>
                  <span>Top channel</span>
                  <strong>Meta</strong>
                </div>
              </div>

              <div className="results-chart-panel">
                <svg viewBox="0 0 420 240" className="results-chart-svg">
                  <defs>
                    <linearGradient
                      id="resultsAreaGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="rgba(79, 70, 229, 0.24)" />
                      <stop offset="100%" stopColor="rgba(79, 70, 229, 0)" />
                    </linearGradient>

                    <linearGradient id="resultsLineGradient" x1="0%" x2="100%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>

                  <path
                    className="results-chart-area"
                    d="M24 190 C82 176 122 160 168 132 C212 106 250 94 298 66 C340 42 370 34 396 24 L396 220 L24 220 Z"
                  />

                  <path
                    className="results-chart-line"
                    pathLength="1"
                    d="M24 190 C82 176 122 160 168 132 C212 106 250 94 298 66 C340 42 370 34 396 24"
                  />

                  <circle className="results-dot dot-one" cx="168" cy="132" r="7" />
                  <circle className="results-dot dot-two" cx="298" cy="66" r="7" />
                  <circle className="results-dot dot-three" cx="396" cy="24" r="7" />
                </svg>

                <div className="chart-callout callout-one">
                  <strong>Best tone</strong>
                  <span>Confident</span>
                </div>

                <div className="chart-callout callout-two">
                  <strong>Winner found</strong>
                  <span>CTR +18%</span>
                </div>
              </div>

              <div className="results-insight-list">
                <div>
                  <span />
                  Brand Kit applied before generation
                </div>

                <div>
                  <span />
                  Top performer saved to creative library
                </div>

                <div>
                  <span />
                  Winner profile ready for next campaign
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}