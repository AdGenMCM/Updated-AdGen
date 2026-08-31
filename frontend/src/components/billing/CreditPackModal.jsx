import React, { useEffect, useState } from "react";
import { X, Image, Video, Check } from "lucide-react";
import { useAuth } from "../../AuthProvider";
import { createCreditCheckoutSession } from "../../api/payments";
import "./CreditPackModal.css";

export const CREDIT_PACKS = [
  { id: "image_mini", kind: "image", name: "Image Mini", credits: 10, price: "$4.99" },
  { id: "image_plus", kind: "image", name: "Image Plus", credits: 30, price: "$12.99", featured: true },
  { id: "video_mini", kind: "video", name: "Video Mini", credits: 3, price: "$9.99" },
  { id: "video_plus", kind: "video", name: "Video Plus", credits: 8, price: "$22.99", featured: true },
];

export default function CreditPackModal({ open, onClose, returnPath, title = "Add extra credits" }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  // A checkout can be abandoned by closing the Stripe tab/window or by
  // navigating back to ADGen. Browsers may restore this component from their
  // back-forward cache with its old React state, so always clear the temporary
  // "Opening checkout…" lock when ADGen becomes active again.
  useEffect(() => {
    const resetCheckoutState = () => {
      setLoading("");
    };

    window.addEventListener("pageshow", resetCheckoutState);
    window.addEventListener("focus", resetCheckoutState);

    return () => {
      window.removeEventListener("pageshow", resetCheckoutState);
      window.removeEventListener("focus", resetCheckoutState);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setLoading("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const buy = async (packId) => {
    if (!currentUser) return;
    setLoading(packId); setError("");
    try {
      const token = await currentUser.getIdToken(true);
      const { url } = await createCreditCheckoutSession({ packId, token, returnPath: returnPath || `${window.location.pathname}${window.location.search}` });
      window.location.href = url;
    } catch (err) {
      setError(err?.message || "Could not start credit checkout.");
      setLoading("");
    }
  };

  const renderGroup = (kind, heading, Icon) => (
    <div className="credit-pack-group">
      <div className="credit-pack-group-title"><Icon size={18} /><strong>{heading}</strong></div>
      <div className="credit-pack-grid">
        {CREDIT_PACKS.filter((p) => p.kind === kind).map((pack) => (
          <button key={pack.id} type="button" className={`credit-pack-card ${pack.featured ? "featured" : ""}`} onClick={() => buy(pack.id)} disabled={Boolean(loading)}>
            {pack.featured && <span className="credit-pack-best">Best value</span>}
            <span className="credit-pack-name">{pack.name}</span>
            <strong>{pack.credits} credits</strong>
            <span className="credit-pack-price">{pack.price}</span>
            <small>One-time purchase</small>
            <span className="credit-pack-select"><Check size={14} /> {loading === pack.id ? "Opening checkout…" : "Choose pack"}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="credit-pack-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <section className="credit-pack-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="credit-pack-close" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="credit-pack-head"><span>Optional add-on</span><h2>{title}</h2><p>Purchased credits never expire and are used after your included plan credits.</p></div>
        {renderGroup("image", "Image credits", Image)}
        {renderGroup("video", "Video credits", Video)}
        {error && <p className="credit-pack-error">{error}</p>}
        <button className="credit-pack-skip" type="button" onClick={onClose}>Skip for now</button>
      </section>
    </div>
  );
}
