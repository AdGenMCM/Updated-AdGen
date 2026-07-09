import React, { useRef } from "react";
import "./TiltCard.css";

export default function TiltCard({
  children,
  className = "",
  maxTilt = 3,
  maxMove = 6,
}) {
  const ref = useRef(null);

  const handleMove = (e) => {
    const card = ref.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY = ((x / rect.width) - 0.5) * (maxTilt * 2);
    const rotateX = ((0.5 - y / rect.height)) * (maxTilt * 2);

    const moveX = ((x / rect.width) - 0.5) * (maxMove * 2);
    const moveY = ((y / rect.height) - 0.5) * (maxMove * 2);

    card.style.setProperty("--tilt-x", `${rotateX}deg`);
    card.style.setProperty("--tilt-y", `${rotateY}deg`);

    card.style.setProperty("--glow-x", `${x}px`);
    card.style.setProperty("--glow-y", `${y}px`);

    card.style.setProperty("--move-x", `${moveX}px`);
    card.style.setProperty("--move-y", `${moveY}px`);
  };

  const reset = () => {
    const card = ref.current;

    if (!card) return;

    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--move-x", "0px");
    card.style.setProperty("--move-y", "0px");
  };

  return (
    <div
      ref={ref}
      className={`adgen-tilt-card ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={reset}
    >
      <div className="adgen-tilt-content">
        {children}
      </div>

      <div className="adgen-tilt-glow" />
    </div>
  );
}