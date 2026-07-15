import React from "react";
import "./Privacy.css";

const sections = [
  ["overview", "Overview"],
  ["collection", "Information We Collect"],
  ["use", "How We Use Information"],
  ["sharing", "How We Share Information"],
  ["creative-data", "Creative Data"],
  ["retention", "Retention"],
  ["security", "Security"],
  ["rights", "Your Rights"],
  ["children", "Children"],
  ["changes", "Changes"],
  ["contact", "Contact"],
];

export default function Privacy() {
  const companyName = "ADGen MCM";
  const supportEmail = "support@adgenmcm.com";
  const lastUpdated = "July 14, 2026";

  return (
    <main className="legal-v2-page">
      <header className="legal-v2-hero">
        <div className="legal-v2-hero-inner">
          <span className="legal-v2-eyebrow">Legal</span>
          <h1>Privacy Policy</h1>
          <p className="legal-v2-hero-copy">
            This policy explains what information ADGen collects, why we use it,
            and the choices available to you.
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
              <strong>Privacy question?</strong>
              <p>Contact us to request access, correction, or deletion.</p>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </div>
          </aside>

          <div className="legal-v2-content">
            <section id="overview" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">01</span>
                <h2>Overview</h2>
              </div>
              <p>
                This Privacy Policy describes how {companyName} collects, uses,
                discloses, and protects information when you use our website,
                applications, and related services.
              </p>
              <p>
                By using the Service, you acknowledge the practices described in
                this policy.
              </p>
            </section>

            <section id="collection" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">02</span>
                <h2>Information we collect</h2>
              </div>

              <div className="legal-v2-data-grid">
                <div className="legal-v2-data-card">
                  <h3>Account information</h3>
                  <p>
                    Name, email address, authentication provider, user
                    identifier, verification status, and account preferences.
                  </p>
                </div>

                <div className="legal-v2-data-card">
                  <h3>Subscription information</h3>
                  <p>
                    Plan, billing status, renewal dates, transaction
                    confirmation, and customer identifiers received from our
                    payment processor.
                  </p>
                </div>

                <div className="legal-v2-data-card">
                  <h3>Creative information</h3>
                  <p>
                    Prompts, uploads, logos, Brand Kit details, generated assets,
                    campaign information, and performance data you choose to
                    provide.
                  </p>
                </div>

                <div className="legal-v2-data-card">
                  <h3>Usage and technical data</h3>
                  <p>
                    Features used, generation counts, timestamps, storage usage,
                    logs, device information, browser type, IP address, and
                    security events.
                  </p>
                </div>

                <div className="legal-v2-data-card">
                  <h3>Communications</h3>
                  <p>
                    Messages, support requests, feedback, and other information
                    you send to us.
                  </p>
                </div>

                <div className="legal-v2-data-card">
                  <h3>Analytics information</h3>
                  <p>
                    Website visits, referral information, page interactions, and
                    campaign attribution used to understand product and
                    marketing performance.
                  </p>
                </div>
              </div>
            </section>

            <section id="use" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">03</span>
                <h2>How we use information</h2>
              </div>
              <ul className="legal-v2-list">
                <li>Provide, operate, maintain, and improve the Service.</li>
                <li>Authenticate users and protect accounts.</li>
                <li>Process subscriptions and maintain billing records.</li>
                <li>Enforce plan limits and calculate usage.</li>
                <li>Create requested outputs and save creative assets.</li>
                <li>Detect fraud, abuse, security threats, and technical issues.</li>
                <li>
                  Send transactional messages relating to billing, security,
                  account activity, support, and policy changes.
                </li>
                <li>
                  Analyze product performance and improve the user experience.
                </li>
              </ul>
            </section>

            <section id="sharing" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">04</span>
                <h2>How we share information</h2>
              </div>
              <p>
                We disclose information only when reasonably necessary to
                operate the Service, comply with law, or protect legitimate
                interests.
              </p>
              <ul className="legal-v2-list">
                <li>
                  Authentication and identity providers that manage sign-in and
                  account verification.
                </li>
                <li>
                  Payment processors that manage subscriptions, transactions,
                  invoices, and payment methods.
                </li>
                <li>
                  Creative and AI service providers that process prompts,
                  reference assets, images, video, text, or audio needed to
                  produce requested outputs.
                </li>
                <li>
                  Cloud infrastructure, storage, analytics, logging, email, and
                  monitoring providers.
                </li>
                <li>
                  Professional advisers, regulators, courts, or law-enforcement
                  authorities when legally required or reasonably necessary.
                </li>
                <li>
                  A buyer, successor, or other party involved in a merger,
                  financing, acquisition, restructuring, or sale of assets.
                </li>
              </ul>
              <div className="legal-v2-callout">
                <strong>We do not sell personal information</strong>
                <p>
                  We do not sell personal information for money. Some analytics
                  or advertising technology may be treated differently under
                  certain state privacy laws, and available opt-out rights may
                  vary by location.
                </p>
              </div>
            </section>

            <section id="creative-data" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">05</span>
                <h2>Creative data and third-party processing</h2>
              </div>
              <p>
                To provide generation, editing, optimization, storage, and
                analysis features, we may transmit relevant inputs to service
                providers that perform those functions on our behalf.
              </p>
              <p>
                Do not submit confidential, regulated, or sensitive personal
                information unless the Service expressly requests it and you
                have a lawful basis to provide it.
              </p>
              <div className="legal-v2-callout">
                <strong>Protect third-party information</strong>
                <p>
                  You are responsible for obtaining the rights and permissions
                  needed before uploading another person’s information, image,
                  voice, intellectual property, or confidential material.
                </p>
              </div>
            </section>

            <section id="retention" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">06</span>
                <h2>Data retention</h2>
              </div>
              <p>
                We retain information for as long as reasonably necessary to
                operate the Service, provide account features, maintain business
                and transaction records, prevent abuse, resolve disputes, and
                comply with legal obligations.
              </p>
              <p>
                Retention periods may differ depending on the type of
                information, account status, contractual requirements, backups,
                and applicable law.
              </p>
            </section>

            <section id="security" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">07</span>
                <h2>Security</h2>
              </div>
              <p>
                We use administrative, technical, and organizational safeguards
                designed to protect information against unauthorized access,
                alteration, disclosure, loss, or misuse.
              </p>
              <p>
                No internet service or storage system can be guaranteed to be
                completely secure. You should use a strong password, protect
                your account, and contact us if you suspect unauthorized access.
              </p>
            </section>

            <section id="rights" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">08</span>
                <h2>Your choices and privacy rights</h2>
              </div>
              <p>
                Depending on your location, you may have the right to request
                access to, correction of, deletion of, or a copy of certain
                personal information. You may also have rights to object to or
                limit certain processing.
              </p>
              <ul className="legal-v2-list">
                <li>
                  Update account information through available account settings.
                </li>
                <li>Cancel a subscription through the billing portal.</li>
                <li>
                  Request privacy assistance by emailing{" "}
                  <a className="legal-v2-link" href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                  .
                </li>
                <li>
                  Unsubscribe from optional marketing messages using the link in
                  the message, when provided.
                </li>
              </ul>
              <p>
                We may need to verify your identity before completing a request.
                Some information may be retained when permitted or required by
                law.
              </p>
            </section>

            <section id="children" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">09</span>
                <h2>Children’s privacy</h2>
              </div>
              <p>
                The Service is intended for adults and is not directed to
                children under 13. We do not knowingly collect personal
                information from children under 13.
              </p>
              <p>
                If you believe a child has submitted personal information,
                contact us so we can review and address the request.
              </p>
            </section>

            <section id="changes" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">10</span>
                <h2>Changes to this policy</h2>
              </div>
              <p>
                We may update this Privacy Policy to reflect changes to the
                Service, our practices, or legal requirements. When appropriate,
                we will provide notice of material changes.
              </p>
            </section>

            <section id="contact" className="legal-v2-section">
              <div className="legal-v2-section-head">
                <span className="legal-v2-section-number">11</span>
                <h2>Contact</h2>
              </div>
              <p>
                Privacy questions or requests may be sent to{" "}
                <a className="legal-v2-link" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </p>
            </section>

            <div className="legal-v2-contact">
              <span>Privacy support</span>
              <h2>Questions about your information?</h2>
              <p>
                Contact the ADGen team to ask a privacy question or submit a
                request concerning your account information.
              </p>
              <a href={`mailto:${supportEmail}`}>Contact support</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}




