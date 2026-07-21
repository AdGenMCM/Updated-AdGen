export const AD_ELEMENT_PRESETS = [
  { type: "ctaButton", label: "CTA Button", icon: "↗" },
  { type: "saleBadge", label: "Sale Badge", icon: "%" },
  { type: "priceTag", label: "Price Tag", icon: "$" },
  { type: "ratingStars", label: "Rating Stars", icon: "★" },
  { type: "promoPill", label: "Promo Pill", icon: "●" },
  { type: "ribbon", label: "Ribbon", icon: "◆" },
  { type: "productCard", label: "Product Card", icon: "▣" },
  { type: "frame", label: "Frame", icon: "▢" },
];

export function createAdElementLayer(type, createId) {
  const base = {
    id: createId(type),
    type,
    x: 320,
    y: 420,
    width: 440,
    height: 130,
    rotation: 0,
    opacity: 1,
  };

  switch (type) {
    case "ctaButton":
      return {
        ...base,
        name: "CTA Button",
        text: "SHOP NOW",
        fill: "#2563eb",
        textColor: "#ffffff",
        fontSize: 42,
        cornerRadius: 28,
        shadowEnabled: true,
        shadowBlur: 24,
        shadowOpacity: 0.22,
      };

    case "saleBadge":
      return {
        ...base,
        name: "Sale Badge",
        width: 270,
        height: 270,
        x: 405,
        y: 405,
        text: "50%\nOFF",
        fill: "#ef4444",
        textColor: "#ffffff",
        fontSize: 54,
        badgePoints: 18,
      };

    case "priceTag":
      return {
        ...base,
        name: "Price Tag",
        width: 360,
        height: 180,
        text: "$29.99",
        subtext: "LIMITED OFFER",
        fill: "#111827",
        accentColor: "#f59e0b",
        textColor: "#ffffff",
        fontSize: 60,
      };

    case "ratingStars":
      return {
        ...base,
        name: "Rating Stars",
        width: 430,
        height: 92,
        text: "4.9",
        fill: "#f59e0b",
        textColor: "#111827",
        fontSize: 38,
        rating: 5,
        showRatingText: true,
      };

    case "promoPill":
      return {
        ...base,
        name: "Promo Pill",
        width: 360,
        height: 96,
        text: "LIMITED TIME",
        fill: "#ede9fe",
        textColor: "#6d28d9",
        fontSize: 34,
        cornerRadius: 48,
      };

    case "ribbon":
      return {
        ...base,
        name: "Ribbon",
        width: 520,
        height: 150,
        text: "BEST SELLER",
        fill: "#7c3aed",
        accentColor: "#5b21b6",
        textColor: "#ffffff",
        fontSize: 42,
      };

    case "productCard":
      return {
        ...base,
        name: "Product Card",
        width: 480,
        height: 300,
        title: "Premium Formula",
        text: "Built to stand out and convert.",
        price: "$39",
        fill: "#ffffff",
        textColor: "#111827",
        accentColor: "#2563eb",
        cornerRadius: 32,
        fontSize: 38,
      };

    case "frame":
      return {
        ...base,
        name: "Frame",
        width: 700,
        height: 700,
        x: 190,
        y: 190,
        fill: "transparent",
        stroke: "#2563eb",
        strokeWidth: 16,
        cornerRadius: 40,
      };

    default:
      return base;
  }
}
