import React from "react";
import "./Hero.css";

import Section from "../layout/Section";
import MarketingButton from "../actions/MarketingButton";
import ProductCanvas from "../ProductCanvas";
import ProductMomentCard from "../ProductMomentCard";
import DashboardPreview from "../DashboardPreview";
import ParallaxCard from "../../motion/ParallaxCard";

export default function Hero() {
  return (
    <Section
      size="xl"
      container="wide"
      align="center"
      className="adgen-marketing-hero"
    >
      <div className="adgen-marketing-hero-bg" />

      <div className="adgen-marketing-hero-content">
        <p className="adgen-marketing-hero-eyebrow">Creative Platform</p>

        <h1>
          <span className="marketing-hero-line marketing-hero-line-primary">
            Everything your brand needs.
          </span>

          <span className="marketing-hero-line marketing-hero-line-secondary">
            From first draft to campaign-ready creative.
          </span>
        </h1>

        <p className="adgen-marketing-hero-description">
          Generate images, videos, and ad copy, apply your Brand Kit across
          every asset, organize your creative library, and improve
          performance—all from one intelligent creative workspace.
        </p>

        <div className="adgen-marketing-hero-actions">
          <MarketingButton href="/subscribe" size="lg">
            Start creating
          </MarketingButton>

          <MarketingButton href="/platform" size="lg" variant="secondary">
            See the platform
          </MarketingButton>
        </div>
      </div>

      <div className="adgen-marketing-hero-visual">
      <ParallaxCard>
        <ProductCanvas
          variant="hero"
          alt="AdGen creative platform dashboard"
          floatingCards={
            <>
              <ProductMomentCard
                position="top-left"
                status="success"
                icon="brand"
                eyebrow="Brand Kit"
                title="Brand applied"
                detail="Logo, colors, and fonts synced"
              />

              <ProductMomentCard
                position="top-right"
                status="active"
                icon="spark"
                eyebrow="Generation"
                title="Creative building"
                detail="Images, video, and copy in progress"
              />

              <ProductMomentCard
                position="bottom-left"
                status="insight"
                icon="chart"
                eyebrow="Insights"
                title="CTR +18%"
                detail="Top creative identified"
              />

              <ProductMomentCard
                position="bottom-right"
                status="video"
                icon="video"
                eyebrow="Video"
                title="Video ready"
                detail="6-second ad exported"
              />
            </>
          }
        >
          <DashboardPreview />
        </ProductCanvas>
      </ParallaxCard>
      </div>
    </Section>
  );
}