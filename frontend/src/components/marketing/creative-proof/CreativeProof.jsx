import React from "react";
import "./CreativeProof.css";
import MarketingButton from "../actions/MarketingButton";

const rowOne = [
  { src: "/examples/imagegen/image-ex4.webp", alt: "Cold brew product campaign generated with ADGen" },
  { src: "/examples/imagegen/image-ex6.webp", alt: "Skincare product campaign generated with ADGen" },
  { src: "/examples/imagegen/image-ex9.webp", alt: "Performance apparel campaign generated with ADGen" },
  { src: "/examples/imagegen/image-cartoon2.webp", alt: "Late-night pizza social creative generated with ADGen" },
  { src: "/examples/imagegen/image-cartoon3.webp", alt: "Futuristic sneaker concept generated with ADGen" },
  { src: "/examples/imagegen/image-ex11.webp", alt: "Song release campaign generated with ADGen" },
];

const rowTwo = [
  { src: "/examples/imagegen/image-ex5.webp", alt: "Bluegrass album campaign generated with ADGen" },
  { src: "/examples/imagegen/image-ex7.webp", alt: "Collector's edition campaign generated with ADGen" },
  { src: "/examples/imagegen/image-ex8.webp", alt: "Fitness program campaign generated with ADGen" },
  { src: "/examples/imagegen/image-cartoon1.webp", alt: "Music studio illustrated creative generated with ADGen" },
  { src: "/examples/imagegen/image-cartoon4.webp", alt: "Monday morning comic generated with ADGen" },
  { src: "/examples/imagegen/image-ex12.webp", alt: "Air Freshener product campaign generated with ADGen" },
];

function MarqueeRow({ items, reverse = false }) {
  const loop = [...items, ...items];
  return (
    <div className="home-creative-marquee" aria-hidden="true">
      <div className={`home-creative-track ${reverse ? "is-reverse" : ""}`}>
        {loop.map((item, index) => (
          <div className="home-creative-card" key={`${item.src}-${index}`}>
            <img
              src={item.src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreativeProof() {
  return (
    <section className="home-creative-proof" aria-labelledby="home-creative-proof-title">
      <div className="home-creative-proof-heading">
        <p className="home-creative-proof-eyebrow">CREATED WITH ADGEN</p>
        <h2 id="home-creative-proof-title">See what you can create.</h2>
        <p>
          From campaign-ready ads to branded product visuals and custom creative
          concepts—all generated inside the same connected workspace.
        </p>
      </div>

      <div className="home-creative-rows">
        <MarqueeRow items={rowOne} />
        <MarqueeRow items={rowTwo} reverse />
      </div>

      <div className="home-creative-proof-action">
        <MarketingButton href="/examples" size="lg" variant="secondary">
          Explore all examples
        </MarketingButton>
      </div>
    </section>
  );
}
