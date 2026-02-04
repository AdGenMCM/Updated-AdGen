// src/pages/Privacy.js
import React from "react";
import "./Privacy.css";

export default function Privacy() {
  const lastUpdated = "February 4, 2026"; // <-- change as needed
  const companyName = "ADGen MCM";
  const supportEmail = "adgenmcm@gmail.com"; // <-- change as needed

  return (
    <main className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-meta">
            <strong>Last Updated:</strong> {lastUpdated}
          </p>
        </header>

        <section className="legal-section">
          <h2 className="legal-h2">1. Overview</h2>
          <p className="legal-p">
            This Privacy Policy describes how {companyName} collects, uses, and shares information
            when you use our website and services (the “Service”).
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">2. Information We Collect</h2>

          <h3 className="legal-h3">A. Account Information</h3>
          <p className="legal-p">
            When you create an account, we collect information such as your email address and a user
            identifier. Authentication may be provided via Firebase or another identity provider.
          </p>

          <h3 className="legal-h3">B. Billing Information</h3>
          <p className="legal-p">
            If you subscribe, payments are processed by Stripe (or another payment processor). We do
            not store your full payment card number. We may receive billing metadata such as your
            subscription status, plan, and payment confirmation.
          </p>

          <h3 className="legal-h3">C. Usage &amp; Product Data</h3>
          <p className="legal-p">
            We collect usage information such as features used, generation counts, timestamps, and
            technical logs to operate the Service, enforce usage limits, prevent abuse, and improve
            performance.
          </p>

          <h3 className="legal-h3">D. Technical Data</h3>
          <p className="legal-p">
            We may collect device and connection data such as IP address, browser type, device type,
            and approximate location derived from IP for security and analytics.
          </p>

          <h3 className="legal-h3">E. Content You Provide</h3>
          <p className="legal-p">
            We process the prompts, inputs, and other content you submit to generate outputs. Content
            may be transmitted to AI service providers in order to provide the Service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">3. How We Use Information</h2>
          <ul className="legal-ul">
            <li className="legal-li">Provide, operate, and maintain the Service</li>
            <li className="legal-li">Authenticate users and secure accounts</li>
            <li className="legal-li">Process subscriptions and payments</li>
            <li className="legal-li">Enforce plan limits and prevent fraud/abuse</li>
            <li className="legal-li">Improve product quality, reliability, and user experience</li>
            <li className="legal-li">Send service-related notices (billing, security, policy updates)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">4. How We Share Information</h2>
          <p className="legal-p">
            We share information only as needed to provide the Service, including with:
          </p>

          <ul className="legal-ul">
            <li className="legal-li">
              <strong>Authentication providers</strong> (e.g., Firebase) to manage login and identity
            </li>
            <li className="legal-li">
              <strong>Payment processors</strong> (e.g., Stripe) to process payments and manage
              subscriptions
            </li>
            <li className="legal-li">
              <strong>AI providers</strong> to generate outputs based on your inputs
            </li>
            <li className="legal-li">
              <strong>Infrastructure/analytics vendors</strong> for hosting, logging, and monitoring
            </li>
          </ul>

          <p className="legal-p">
            We may also disclose information if required by law, to protect rights and safety, or in
            connection with a business transfer (e.g., merger, acquisition, or asset sale).
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">5. Data Retention</h2>
          <p className="legal-p">
            We retain information as long as necessary to provide the Service, comply with legal
            obligations, resolve disputes, and enforce our agreements. You may request deletion by
            contacting{" "}
            <a className="legal-link" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">6. Security</h2>
          <p className="legal-p">
            We use reasonable administrative, technical, and organizational safeguards to protect
            information. No method of transmission or storage is 100% secure, and we cannot guarantee
            absolute security.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">7. Your Choices &amp; Rights</h2>
          <p className="legal-p">
            Depending on your location, you may have rights to access, correct, or delete your
            personal information, or to object to certain processing. To make a request, contact{" "}
            <a className="legal-link" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">8. Children’s Privacy</h2>
          <p className="legal-p">
            The Service is not intended for children under 13 (or under 16 where applicable). We do
            not knowingly collect personal information from children.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">9. Changes to this Policy</h2>
          <p className="legal-p">
            We may update this Privacy Policy from time to time. If we make material changes, we will
            provide reasonable notice. Continued use after changes become effective means you accept
            the updated policy.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">10. Contact</h2>
          <p className="legal-p">
            Questions about privacy? Email{" "}
            <a className="legal-link" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}



