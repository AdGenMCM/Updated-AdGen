// src/pages/Terms.js
import React from "react";
import "./Terms.css";

export default function Terms() {
  const lastUpdated = "February 4, 2026"; // <-- change as needed
  const companyName = "ADGen MCM";
  const supportEmail = "adgenmcm@gmail.com"; // <-- change as needed

  return (
    <main className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-meta">
            <strong>Last Updated:</strong> {lastUpdated}
          </p>
        </header>

        <section className="legal-section">
          <h2 className="legal-h2">1. Acceptance of Terms</h2>
          <p className="legal-p">
            By accessing or using {companyName} (the “Service”, “we”, “us”, or “our”), you agree to be
            bound by these Terms of Service (“Terms”). If you do not agree to these Terms, do not use
            the Service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">2. Description of the Service</h2>
          <p className="legal-p">
            {companyName} is a subscription-based software-as-a-service (SaaS) platform that provides
            AI-powered tools to generate advertising content, including text and images. Features,
            functionality, and limits may vary by plan and may change over time.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">3. Eligibility</h2>
          <p className="legal-p">
            You must be at least 18 years old and capable of forming a binding contract to use the
            Service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">4. Accounts &amp; Authentication</h2>
          <ul className="legal-ul">
            <li className="legal-li">You may need an account to access certain features.</li>
            <li className="legal-li">
              Authentication may be provided by third-party services (e.g., Firebase).
            </li>
            <li className="legal-li">
              You are responsible for maintaining the confidentiality of your credentials and for all
              activity under your account.
            </li>
          </ul>
          <p className="legal-p">
            We may suspend or terminate accounts that violate these Terms or present security risks.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">5. Subscriptions, Billing &amp; Payments</h2>
          <ul className="legal-ul">
            <li className="legal-li">
              Paid plans are billed on a recurring basis (monthly or annually, depending on plan).
            </li>
            <li className="legal-li">
              Payments are processed by a third-party payment processor (e.g., Stripe). We do not
              store your full payment card details.
            </li>
            <li className="legal-li">Subscription fees are charged in advance for each billing cycle.</li>
            <li className="legal-li">
              If payment fails or is reversed, access to paid features may be limited or suspended.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">6. Usage Caps &amp; Fair Use</h2>
          <p className="legal-p">
            Each subscription plan may include usage limits (e.g., generations, credits, API calls, or
            rate limits). Usage will reset at the start of each month.
          </p>
          <ul className="legal-ul">
            <li className="legal-li">
              If you reach your limit, the Service may block additional usage until reset, upgrade, or
              purchase of additional capacity (if available).
            </li>
            <li className="legal-li">
              Attempting to bypass limits, abuse the Service, or manipulate billing/usage tracking is
              a violation of these Terms.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">7. Acceptable Use</h2>
          <p className="legal-p">You agree not to use the Service to:</p>
          <ul className="legal-ul">
            <li className="legal-li">Violate any law or regulation.</li>
            <li className="legal-li">
              Generate illegal, harmful, deceptive, or infringing content (including IP/trademark
              infringement).
            </li>
            <li className="legal-li">
              Attempt to reverse-engineer, exploit, scrape, disrupt, or compromise the Service.
            </li>
            <li className="legal-li">Interfere with security, rate limits, or system performance.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">8. AI-Generated Content Disclaimer</h2>
          <ul className="legal-ul">
            <li className="legal-li">
              AI-generated outputs are provided “as is” and may be inaccurate, incomplete, or
              unsuitable.
            </li>
            <li className="legal-li">
              You are solely responsible for reviewing, editing, verifying, and ensuring compliance
              of content before use.
            </li>
            <li className="legal-li">
              We do not guarantee any ad performance, outcomes, or compliance with platform policies
              or laws.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">9. Intellectual Property</h2>
          <p className="legal-p">
            The Service (including software, UI, branding, and infrastructure) is owned by {companyName}
            and protected by intellectual property laws. You retain ownership of content you submit to
            the Service (“Inputs”). Subject to these Terms, you may use generated outputs (“Outputs”)
            for lawful business purposes.
          </p>
          <p className="legal-p">
            You are responsible for ensuring you have the rights to use your Inputs and to publish or
            use Outputs.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">10. Privacy</h2>
          <p className="legal-p">
            Your use of the Service is subject to our Privacy Policy. By using the Service, you
            consent to our data practices described there.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">11. Service Availability</h2>
          <p className="legal-p">
            We aim for high availability, but we do not guarantee uninterrupted access. The Service
            may be unavailable due to maintenance, updates, outages, or factors outside our control.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">12. Cancellation &amp; Refunds</h2>
          <p className="legal-p">
            You may cancel at any time. Unless required by law, subscription fees are non-refundable,
            and we do not provide refunds for partial billing periods, unused usage, or downgrades.
            Cancellation typically takes effect at the end of your current billing cycle.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">13. Termination</h2>
          <p className="legal-p">
            We may suspend or terminate your access to the Service if you violate these Terms, abuse
            the Service, or if necessary to protect the Service, users, or third parties. Upon
            termination, your right to use the Service ends.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">14. Limitation of Liability</h2>
          <p className="legal-p">
            To the maximum extent permitted by law, {companyName} will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits or
            revenues, whether incurred directly or indirectly.
          </p>
          <p className="legal-p">
            To the maximum extent permitted by law, our total liability for any claim arising out of
            or relating to the Service will not exceed the amount you paid to us in the twelve (12)
            months preceding the event giving rise to the claim.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">15. Indemnification</h2>
          <p className="legal-p">
            You agree to indemnify and hold harmless {companyName} from any claims, liabilities,
            damages, losses, and expenses (including reasonable attorneys’ fees) arising out of your
            use of the Service, your content, or your violation of these Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">16. Changes to Terms</h2>
          <p className="legal-p">
            We may update these Terms from time to time. If we make material changes, we will provide
            reasonable notice. Continued use of the Service after changes become effective
            constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">17. Governing Law</h2>
          <p className="legal-p">
            These Terms are governed by the laws of the United States and the applicable state
            jurisdiction where the company is established, without regard to conflict-of-law rules.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-h2">18. Contact</h2>
          <p className="legal-p">
            Questions about these Terms? Contact us at{" "}
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


