import React from "react";
import "./Home.css";

import Hero from "../components/marketing/hero/Hero";
import Workflow from "../components/marketing/workflow/Workflow";
import PlatformShowcase from "../components/marketing/platform/PlatformShowcase";
import ResultsSection from "../components/marketing/results/ResultsSection";
import TrustFoundation from "../components/marketing/trust/TrustFoundation";
import PricingPreview from "../components/marketing/pricing/PricingPreview";
import FinalCTA from "../components/marketing/cta/FinalCTA";
import Reveal from "../components/motion/Reveal";


export default function Home() {
  return (
    <main className="home-page home-v2">
      
      <Hero />

      <Reveal delay={100}>
        <Workflow />
      </Reveal>

      <Reveal delay={100}>
        <PlatformShowcase />
      </Reveal>

      <Reveal delay={100}>
        <ResultsSection />
      </Reveal>

      <Reveal delay={100}>
        <PricingPreview />
      </Reveal>

      <Reveal delay={100}>
        <TrustFoundation />
      </Reveal>

      <Reveal delay={100}>
        <FinalCTA />
      </Reveal>
    </main>
  );
}
