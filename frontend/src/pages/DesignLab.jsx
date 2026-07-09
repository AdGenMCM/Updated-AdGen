import React from "react";
import "./DesignLab.css";

import ProductCanvas from "../components/marketing/ProductCanvas";
import ProductMomentCard from "../components/marketing/ProductMomentCard";
import DashboardPreview from "../components/marketing/DashboardPreview";
import Section from "../components/marketing/layout/Section.jsx";
import SectionHeader from "../components/marketing/typography/SectionHeader.jsx";
import MarketingButton from "../components/marketing/actions/MarketingButton.jsx";
import Hero from "../components/marketing/hero/Hero";
import Workflow from "../components/marketing/workflow/Workflow.jsx";
import PlatformShowcase from "../components/marketing/platform/PlatformShowcase";

console.log("DesignLab imports:", {
  Section,
  SectionHeader,
  MarketingButton,
});

export default function DesignLab() {

    const preview = <DashboardPreview />;
    const compactPreview = <DashboardPreview />;

  return (
    <main className="design-lab-page">
      <section className="design-lab-hero">
        <p className="design-lab-eyebrow">AdGen V2</p>
        <h1>Design Lab</h1>
        <p>
          Internal preview space for refining AdGen marketing components before
          they graduate into public pages.
        </p>
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 006</p>
          <h2>Hero</h2>
        </div>

        <Hero />
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 007</p>
          <h2>Workflow</h2>
        </div>

        <Workflow />
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 008</p>
          <h2>Platform Showcase</h2>
        </div>

        <PlatformShowcase />
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 001</p>
          <h2>ProductCanvas — Hero Variant</h2>
        </div>

        

        <ProductCanvas
          variant="hero"
          alt="AdGen dashboard preview"
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
                eyebrow="AI Generation"
                title="Creative building"
                detail="Prompt, image, and copy in progress"
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
          {preview}
        </ProductCanvas>
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 001</p>
          <h2>ProductCanvas — Showcase Variant</h2>
        </div>

        <ProductCanvas variant="showcase" alt="AdGen product showcase preview">
          {compactPreview}
        </ProductCanvas>
      </section>

      <section className="design-lab-section">
        <div className="design-lab-section-header">
          <p>Component 002</p>
          <h2>ProductMomentCard Set</h2>
        </div>

        <div className="design-lab-moment-grid">
          <ProductMomentCard
            status="success"
            icon="brand"
            eyebrow="Brand Kit"
            title="Brand applied"
            detail="Logo, colors, and fonts synced"
            className="design-lab-static-card"
          />

          <ProductMomentCard
            status="active"
            icon="spark"
            eyebrow="AI Generation"
            title="Creative building"
            detail="Prompt, image, and copy in progress"
            className="design-lab-static-card"
          />

          <ProductMomentCard
            status="insight"
            icon="chart"
            eyebrow="Insights"
            title="CTR +18%"
            detail="Top creative identified"
            className="design-lab-static-card"
          />

          <ProductMomentCard
            status="video"
            icon="video"
            eyebrow="Video"
            title="Video ready"
            detail="6-second ad exported"
            className="design-lab-static-card"
          />
        </div>
      </section>
      <Section size="lg" container="wide" divider>
        <SectionHeader
            eyebrow="Component 003–005"
            title="Section, SectionHeader, and Button System"
            description="Reusable layout, typography, and action primitives that will give every AdGen marketing page the same structure, rhythm, and interaction quality."
        />

        <div className="design-lab-button-row">
            <MarketingButton size="lg">Start creating</MarketingButton>
            <MarketingButton size="lg" variant="secondary">
            View platform
            </MarketingButton>
            <MarketingButton size="lg" variant="ghost">
            Learn more
            </MarketingButton>
        </div>
        </Section>
    </main>
  );
}