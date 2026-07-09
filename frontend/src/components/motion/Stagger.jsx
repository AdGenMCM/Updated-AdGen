import React, { useEffect, useRef, useState } from "react";
import "./Stagger.css";

export default function Stagger({
  children,
  className = "",
  childClassName = "",
  delay = 90,
  startDelay = 0,
  y = 22,
  as: Tag = "div",
}) {
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
      { threshold: 0.18 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const items = React.Children.toArray(children);

  return (
    <Tag
      ref={ref}
      className={`adgen-stagger ${visible ? "is-visible" : ""} ${className}`}
      style={{ "--stagger-y": `${y}px` }}
    >
      {items.map((child, index) => (
        <div
          className={`adgen-stagger-item ${childClassName}`}
          style={{ "--stagger-delay": `${startDelay + index * delay}ms` }}
          key={index}
        >
          {child}
        </div>
      ))}
    </Tag>
  );
}