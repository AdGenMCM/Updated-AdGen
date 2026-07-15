import React from "react";
import "./Terms.css";

const sections = [
  ["acceptance", "Acceptance"],
  ["service", "The Service"],
  ["accounts", "Accounts"],
  ["billing", "Billing"],
  ["limits", "Usage Limits"],
  ["acceptable-use", "Acceptable Use"],
  ["ai-content", "Generated Content"],
  ["ownership", "Ownership"],
  ["availability", "Availability"],
  ["cancellation", "Cancellation"],
  ["liability", "Liability"],
  ["changes", "Changes"],
  ["contact", "Contact"],
];

export default function Terms() {
  const companyName = "ADGen MCM";
  const supportEmail = "support@adgenmcm.com";
  const lastUpdated = "July 14, 2026";

  return (
    <main className="legal-v2-page">
      <header className="legal-v2-hero">
        <div className="legal-v2-hero-inner">
          <span className="legal-v2-eyebrow">Legal</span>
          <h1>Terms of Service</h1>
          <p className="legal-v2-hero-copy">
            These terms explain the rules that apply when you create an account,
            subscribe to a plan, or use the ADGen creative platform.
          </p>
          <div className="legal-v2-meta">
            <span>Last updated</span>
            {lastUpdated}
          </div>
        </div>
      </header>

      <div className="legal-v2-main">
        <div className="legal-v2-layout">
          <aside className="legal-v2-sidebar">
            <div className="legal-v2-toc">
              <span className="legal-v2-toc-label">Contents</span>
              <nav>
                {sections.map(([id, label]) => (
                  <a key={id} href={`#${id}`}>
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="legal-v2-sidebar-help">
              <strong>Questions about these terms?</strong>
              <p>Contact our team for clarification before using the Service.</p>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </div>
          </aside>

          <div className="legal-v2-content">
            <section id="acceptance" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">01</span>
                <h2>Acceptance of these terms</h2>
              </div>
              <p>
                By accessing or using {companyName}, you agree to these Terms of
                Service. If you do not agree, you may not use the Service.
              </p>
              <p>
                You must be at least 18 years old and legally capable of entering
                into a binding agreement.
              </p>
            </section>

            <section id="service" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">02</span>
                <h2>The Service</h2>
              </div>
              <p>
                {companyName} is a subscription-based creative software platform
                that helps users create, organize, edit, analyze, and improve
                advertising assets. Features and limits vary by plan and may be
                changed, added, or discontinued over time.
              </p>
            </section>

            <section id="accounts" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">03</span>
                <h2>Accounts and authentication</h2>
              </div>
              <ul className="legal-v2-list">
                <li>You must provide accurate account information.</li>
                <li>
                  You are responsible for protecting your credentials and for
                  activity that occurs through your account.
                </li>
                <li>
                  Authentication may be handled by trusted identity providers.
                </li>
                <li>
                  We may restrict or suspend accounts that create security,
                  payment, legal, or abuse risks.
                </li>
              </ul>
            </section>

            <section id="billing" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">04</span>
                <h2>Subscriptions and billing</h2>
              </div>
              <ul className="legal-v2-list">
                <li>Plans are billed in advance on a recurring monthly basis.</li>
                <li>
                  Your subscription renews automatically unless it is canceled
                  before the next renewal date.
                </li>
                <li>
                  Payment information is handled by a third-party payment
                  processor. We do not store your complete card details.
                </li>
                <li>
                  Failed, reversed, or disputed payments may result in restricted
                  or suspended access.
                </li>
              </ul>
              <div className="legal-v2-callout">
                <strong>Price changes</strong>
                <p>
                  We may change plan pricing. When required, reasonable notice
                  will be provided before a new price applies to a future renewal.
                </p>
              </div>
            </section>

            <section id="limits" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">05</span>
                <h2>Usage limits and plan capacity</h2>
              </div>
              <p>
                Plans may include limits for image generation, video credits,
                optimization, Brand Kits, storage, or other features. Usage
                generally resets at the beginning of the applicable billing
                period unless otherwise stated.
              </p>
              <ul className="legal-v2-list">
                <li>
                  Additional activity may be blocked after a limit is reached.
                </li>
                <li>Unused capacity does not roll over unless stated otherwise.</li>
                <li>
                  You may not bypass limits or manipulate billing or usage
                  tracking.
                </li>
              </ul>
            </section>

            <section id="acceptable-use" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">06</span>
                <h2>Acceptable use</h2>
              </div>
              <p>You may not use the Service to:</p>
              <ul className="legal-v2-list">
                <li>Violate a law, regulation, court order, or third-party right.</li>
                <li>
                  Create illegal, harmful, deceptive, abusive, or infringing
                  material.
                </li>
                <li>
                  Reverse engineer, scrape, overload, disrupt, or compromise the
                  Service.
                </li>
                <li>
                  Circumvent security controls, usage limits, or access
                  restrictions.
                </li>
                <li>
                  Upload material you do not have the right to use or process.
                </li>
              </ul>
            </section>

            <section id="ai-content" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">07</span>
                <h2>Generated content and advertising decisions</h2>
              </div>
              <p>
                Generated content may occasionally contain errors, omissions,
                unexpected material, or content that is not appropriate for a
                particular campaign.
              </p>
              <div className="legal-v2-callout">
                <strong>Your review is required</strong>
                <p>
                  You are responsible for reviewing, editing, approving, and
                  verifying every output before publishing or using it in
                  advertising, commerce, or other business activity.
                </p>
              </div>
              <p>
                We do not guarantee campaign performance, conversion results,
                legal compliance, platform approval, or suitability for any
                particular use.
              </p>
            </section>

            <section id="ownership" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">08</span>
                <h2>Inputs, outputs, and platform ownership</h2>
              </div>
              <p>
                You retain any ownership rights you have in material you submit
                to the Service. You are responsible for having all rights and
                permissions needed to submit that material.
              </p>
              <p>
                Subject to these Terms, you may use generated outputs for lawful
                business purposes. Similar or identical outputs may be generated
                for other users, and intellectual-property protection for
                generated material may vary.
              </p>
              <p>
                The Service itself—including its software, design, branding,
                workflows, and infrastructure—belongs to {companyName} or its
                licensors.
              </p>
            </section>

            <section id="availability" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">09</span>
                <h2>Availability and third-party services</h2>
              </div>
              <p>
                We work to keep the Service reliable, but uninterrupted or
                error-free access is not guaranteed. Features may depend on
                third-party infrastructure, model providers, storage,
                authentication, or payment services outside our direct control.
              </p>
            </section>

            <section id="cancellation" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">10</span>
                <h2>Cancellation, refunds, and termination</h2>
              </div>
              <p>
                You may cancel through the billing portal. Cancellation normally
                takes effect at the end of the current billing period.
              </p>
              <p>
                Unless required by law, fees are non-refundable, including for
                partial billing periods, unused capacity, downgrades, or
                voluntarily canceled subscriptions.
              </p>
              <p>
                We may suspend or terminate access when these Terms are violated,
                payment is not completed, or action is reasonably necessary to
                protect users, the Service, or third parties.
              </p>
            </section>

            <section id="liability" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">11</span>
                <h2>Disclaimers and limitation of liability</h2>
              </div>
              <p>
                The Service is provided on an “as is” and “as available” basis to
                the fullest extent permitted by law.
              </p>
              <p>
                To the maximum extent permitted by law, {companyName} will not be
                liable for indirect, incidental, special, consequential,
                exemplary, or punitive damages, or for lost revenue, profits,
                data, business opportunities, or goodwill.
              </p>
              <p>
                To the maximum extent permitted by law, our total liability
                relating to the Service will not exceed the amount you paid to us
                during the twelve months before the event giving rise to the
                claim.
              </p>
              <p>
                You agree to indemnify and hold {companyName} harmless from
                claims arising from your content, use of the Service, or
                violation of these Terms or another party’s rights.
              </p>
            </section>

            <section id="changes" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">12</span>
                <h2>Changes and governing law</h2>
              </div>
              <p>
                We may update these Terms. Material changes will receive
                reasonable notice when appropriate. Continued use after updated
                Terms become effective constitutes acceptance.
              </p>
              <p>
                These Terms are governed by the laws applicable in the State of
                New York, without regard to conflict-of-law principles.
              </p>
            </section>

            <section id="contact" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">13</span>
                <h2>Contact</h2>
              </div>
              <p>
                Questions about these Terms may be sent to{" "}
                <a className="legal-v2-link" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </p>
            </section>

            <div className="legal-v2-contact">
              <span>Need clarification?</span>
              <h2>We are happy to help.</h2>
              <p>
                Contact the ADGen team with questions about your account,
                subscription, or these Terms.
              </p>
              <a href={`mailto:${supportEmail}`}>Contact support</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}



