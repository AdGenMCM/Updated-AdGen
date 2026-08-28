import React, { useMemo, useState } from "react";
import "./Examples.css";
import MarketingButton from "../components/marketing/actions/MarketingButton";
import Reveal from "../components/motion/Reveal";

const examples = [
  {
    type: "image",
    src: "/examples/imagegen/image-ex4.webp",
    title: "Cold brew product campaign",
    detail: "Food & beverage advertising • Square 1:1",
    tags: ["Structured ad", "Offer badge", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex5.webp",
    title: "Bluegrass album campaign",
    detail: "Entertainment advertising • Square 1:1",
    tags: ["Product launch", "Headline + copy", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex6.webp",
    title: "Skincare product campaign",
    detail: "Beauty advertising • Square 1:1",
    tags: ["Brand-led", "Benefit copy", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex7.webp",
    title: "Collector's edition campaign",
    detail: "Gaming advertising • Square 1:1",
    tags: ["Product bundle", "Promotion", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex9.webp",
    title: "Performance apparel campaign",
    detail: "Apparel advertising • Square 1:1",
    tags: ["Brand-led", "Lifestyle creative", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex10.webp",
    title: "Before-and-after skincare campaign",
    detail: "Beauty advertising • Square 1:1",
    tags: ["Comparison layout", "Offer", "CTA"],
    format: "square",
  },
  {
    type: "image",
    src: "/examples/imagegen/image-ex8.webp",
    title: "Fitness program campaign",
    detail: "Fitness advertising • Portrait 9:16",
    tags: ["App-focused", "Lifestyle creative", "CTA"],
    format: "portrait",
  },
  {
    type: "custom",
    src: "/examples/imagegen/image-cartoon1.webp",
    title: "Music studio story scene",
    detail: "Illustrated visual storytelling • Square 1:1",
    tags: ["Ad elements off", "No logo", "Scene text"],
    format: "square",
  },
  {
    type: "custom",
    src: "/examples/imagegen/image-cartoon2.webp",
    title: "Late-night pizza social creative",
    detail: "Photorealistic lifestyle concept • Portrait 9:16",
    tags: ["Ad elements off", "No logo", "Speech bubble"],
    format: "portrait",
  },
  {
    type: "custom",
    src: "/examples/imagegen/image-cartoon4.webp",
    title: "Monday morning comic",
    detail: "Multi-panel visual storytelling • Portrait 9:16",
    tags: ["Ad elements off", "No logo", "4-panel story"],
    format: "portrait",
  },
  {
    type: "custom",
    src: "/examples/imagegen/image-cartoon3.webp",
    title: "Futuristic sneaker concept",
    detail: "Conceptual product visualization • Landscape 16:9",
    tags: ["Ad elements off", "No logo", "Interface text"],
    format: "landscape",
  },
];

const videos = [
  { src: "/examples/videogen/video-ex1.mp4", poster: "/examples/videogen/video-ex1-poster.webp", title: "Hydrate energy drink video" },
  { src: "/examples/videogen/video-ex2.mp4", poster: "/examples/videogen/video-ex2-poster.webp", title: "Watch Commercial" },
  { src: "/examples/videogen/video-ex3.mp4", poster: "/examples/videogen/video-ex3-poster.webp", title: "Sneaker product launch video" },
  { src: "/examples/videogen/video-ex4.mp4", poster: "/examples/videogen/video-ex4-poster.webp", title: "Beauty product campaign video" },
  { src: "/examples/videogen/video-ex5.mp4", poster: "/examples/videogen/video-ex5-poster.webp", title: "Clothes Model video" },
  { src: "/examples/videogen/video-ex6.mp4", poster: "/examples/videogen/video-ex6-poster.webp", title: "Banner Text video" },
];

const filters = [
  ["all", "All"],
  ["image", "Image Ads"],
  ["custom", "Custom Creative"],
  ["video", "Video"],
];

export default function Examples() {
  const [filter, setFilter] = useState("all");

  const visible = useMemo(
    () => (filter === "all" ? examples : examples.filter((item) => item.type === filter)),
    [filter]
  );

  const showImages = filter !== "video";
  const showVideos = filter === "all" || filter === "video";

  return (
    <main className="examples-page">
      <section className="examples-hero">
        <div className="examples-container">
          <Reveal>
            <span className="examples-eyebrow">GENERATED WITH ADGEN</span>
            <h1>See what ADGen can create.</h1>
            <p>
              Real creative generated inside ADGen—from structured performance ads
              to branded product campaigns, custom visual concepts, and video.
            </p>
            <div className="examples-actions">
              <MarketingButton href="/subscribe" size="lg">Start creating</MarketingButton>
              <MarketingButton href="/platform" size="lg" variant="secondary">Explore the platform</MarketingButton>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="examples-gallery-section">
        <div className="examples-container">
          <Reveal delay={80}>
            <div className="examples-gallery-heading">
              <div>
                <span>Creative range</span>
                <h2>One generator. More ways to create.</h2>
                <p>
                  Use a traditional ad structure when you need it—or turn standard
                  ad elements off and direct the scene yourself.
                </p>
                <p className="examples-gallery-note">
                  Sample concepts generated in ADGen to demonstrate different creative
                  workflows, formats, and styles.
                </p>
              </div>

              <div className="examples-filters" aria-label="Filter examples">
                {filters.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={filter === value ? "active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {showImages && (
              <div className="examples-grid">
                {visible.map((item, index) => (
                  <article
                    className={`examples-card examples-card-${item.format}`}
                    key={item.src}
                  >
                    <div className="examples-media">
                      <img
                        src={item.src}
                        alt={`${item.title} generated with ADGen`}
                        loading={index < 3 && filter === "all" ? "eager" : "lazy"}
                        fetchPriority={index < 3 && filter === "all" ? "high" : "auto"}
                        decoding="async"
                      />
                      <span className="examples-watermark">Generated with ADGen</span>
                    </div>
                    <div className="examples-card-copy">
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                      <div className="examples-tags">
                        {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {showVideos && (
              <div className={`examples-video-section ${filter === "video" ? "video-only" : ""}`}>
                <div className="examples-video-heading">
                  <span>VIDEO GENERATION</span>
                  <h3>From creative direction to polished motion.</h3>
                  <p>
                    Generate short-form video creative for product, lifestyle,
                    and campaign use cases.
                  </p>
                </div>

                <div className="examples-video-grid">
                  {videos.map((video) => (
                    <article className="examples-video-card" key={video.src}>
                      <div className="examples-video-frame">
                        <video
                          src={video.src}
                          poster={video.poster}
                          controls
                          playsInline
                          preload="none"
                        >
                          Your browser does not support embedded video.
                        </video>
                        <span>Generated with ADGen</span>
                      </div>
                      <div className="examples-video-card-copy">
                        <h4>{video.title}</h4>
                        <p>Video generated inside ADGen.</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      <section className="examples-control-section">
        <div className="examples-container examples-control-grid">
          <Reveal>
            <span className="examples-eyebrow">CREATIVE CONTROL</span>
            <h2>Structured ad or custom concept—you choose.</h2>
            <p>
              Quick Create handles the essentials. The Full Creative Workspace gives
              you control over copy, branding, format, references, creative structure,
              campaign details, and Performance Intelligence.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="examples-control-cards">
              <article>
                <span>QUICK CREATE</span>
                <strong>Get to a finished creative faster.</strong>
                <p>Set the idea, audience, format, standard ad elements, and logo behavior.</p>
              </article>
              <article>
                <span>FULL WORKSPACE</span>
                <strong>Control the complete creative direction.</strong>
                <p>
                  Configure copy, Brand Kit, references, style, campaign context,
                  and learned performance guidance.
                </p>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="examples-final">
        <div className="examples-container">
          <Reveal>
            <span className="examples-eyebrow">READY TO CREATE?</span>
            <h2>Turn your next idea into campaign-ready creative.</h2>
            <p>Start quickly, then add as much creative control as the campaign needs.</p>
            <MarketingButton href="/subscribe" size="lg">Start creating</MarketingButton>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
