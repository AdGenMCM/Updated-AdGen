import React from "react";
import { Link } from "react-router-dom";
import "./MarketingFooter.css";

const productLinks = [
  { to: "/platform", label: "Platform" },
  { to: "/examples", label: "Examples" },
  { to: "/pricing", label: "Pricing" },
];

const companyLinks = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const legalLinks = [
  { to: "/terms", label: "Terms of Service" },
  { to: "/privacy", label: "Privacy Policy" },
];

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <div className="marketing-footer-top">
          <div className="marketing-footer-brand">
            <Link to="/" className="marketing-footer-logo-link" aria-label="ADGen MCM home">
              <img
                src="/images/ADGen MCM Logo Update Transparent copy.png"
                alt="ADGen MCM"
                className="marketing-footer-logo"
              />
            </Link>

            <p>
              Create, measure, and improve ad creative in one connected workspace.
            </p>
          </div>

          <div className="marketing-footer-nav">
            <div className="marketing-footer-group">
              <span>Product</span>
              {productLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="marketing-footer-group">
              <span>Company</span>
              {companyLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="marketing-footer-group">
              <span>Legal</span>
              {legalLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="marketing-footer-bottom">
          <span>© {year} ADGen MCM. All rights reserved.</span>
          <span>Creative workspace for modern advertising.</span>
        </div>
      </div>
    </footer>
  );
}
