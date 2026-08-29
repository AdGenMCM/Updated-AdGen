import React, { useEffect, useRef, useState } from "react";
import "./Reveal.css";

export default function Reveal({
  children,
  className = "",
  delay = 0,
  y = 28,
  as: Tag = "div",
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reveal as soon as even a small part of the element enters the viewport.
    // A percentage threshold (such as 0.18) can never be reached by very tall
    // sections on small mobile screens, leaving them permanently transparent.
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      {
        threshold: 0.01,
        rootMargin: "0px 0px -4% 0px",
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`adgen-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{
        "--reveal-delay": `${delay}ms`,
        "--reveal-y": `${y}px`,
      }}
    >
      {children}
    </Tag>
  );
}