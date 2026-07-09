import React, { useRef } from "react";
import "./ParallaxCard.css";

export default function ParallaxCard({
  children,
  className = "",
  maxRotate = 4,
  maxTranslate = 8,
}) {
  const ref = useRef(null);

  const handleMove = (e) => {
    const card = ref.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY = ((x / rect.width) - 0.5) * (maxRotate * 2);
    const rotateX = ((0.5 - y / rect.height)) * (maxRotate * 2);

    const moveX = ((x / rect.width) - 0.5) * (maxTranslate * 2);
    const moveY = ((y / rect.height) - 0.5) * (maxTranslate * 2);

    card.style.setProperty("--rotate-x", `${rotateX}deg`);
    card.style.setProperty("--rotate-y", `${rotateY}deg`);
    card.style.setProperty("--move-x", `${moveX}px`);
    card.style.setProperty("--move-y", `${moveY}px`);
  };

  const reset = () => {
    const card = ref.current;
    if (!card) return;

    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
    card.style.setProperty("--move-x", "0px");
    card.style.setProperty("--move-y", "0px");
  };

  return (
    <div
      ref={ref}
      className={`adgen-parallax-card ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={reset}
    >
      <div className="adgen-parallax-inner">
        {children}
      </div>

      <div className="adgen-parallax-glow" />
    </div>
  );
}