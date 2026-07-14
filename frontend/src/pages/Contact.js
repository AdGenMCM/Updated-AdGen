import { useMemo, useState } from "react";
import "./Contact.css";

import Reveal from "../components/motion/Reveal";
import MarketingButton from "../components/marketing/actions/MarketingButton";

export default function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    topic: "General question",
    message: "",
  });

  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const isSending = status === "sending";
  const isSuccess = status === "success";
  const isError = status === "error";

  const API_BASE = "https://updated-adgen-1.onrender.com";

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() &&
      form.email.trim() &&
      form.message.trim() &&
      !isSending
    );
  }, [form, isSending]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setStatus("idle");
    setStatusMessage("");
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("sending");
    setStatusMessage("");

    const contextualMessage = [
      `Topic: ${form.topic}`,
      form.company.trim() ? `Company: ${form.company.trim()}` : null,
      "",
      form.message.trim(),
    ]
      .filter((value) => value !== null)
      .join("\n");

    try {
      const response = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: contextualMessage,
        }),
      });

      if (!response.ok) {
        let detail = "";

        try {
          const data = await response.json();
          detail = data?.detail ? ` (${data.detail})` : "";
        } catch {
          // Ignore malformed error responses.
        }

        throw new Error(`Request failed${detail}`);
      }

      setStatus("success");
      setStatusMessage(
        "Your message was sent. AdGen MCM Support will get back to you shortly."
      );

      setForm({
        name: "",
        email: "",
        company: "",
        topic: "General question",
        message: "",
      });

      window.setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
      }, 5500);
    } catch (error) {
      console.error("Contact form submission failed:", error);
      setStatus("error");
      setStatusMessage(
        "Something went wrong while sending your message. Please try again in a moment."
      );
    }
  };

  return (
    <main className="contact-page contact-v2">
      <section className="contact-v2-hero">
        <div className="contact-v2-hero-bg" aria-hidden="true" />

        <div className="contact-v2-container contact-v2-hero-inner">
          <p className="contact-v2-eyebrow">Contact AdGen MCM</p>

          <h1>
            <span>Let’s talk about</span>
            <span>what you’re building.</span>
          </h1>

          <p className="contact-v2-hero-copy">
            Have a product question, need help with your account, or want to
            discuss how AdGen could fit your creative workflow? Send a message
            and you’ll hear back directly.
          </p>

          <div className="contact-v2-hero-actions">
            <MarketingButton href="/platform" size="lg">
              Explore the platform
            </MarketingButton>

            <MarketingButton href="/pricing" size="lg" variant="secondary">
              View pricing
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="contact-v2-main">
        <div className="contact-v2-container contact-v2-grid">
          <Reveal>
            <div className="contact-v2-copy">
              <span className="contact-v2-pill">How can we help?</span>

              <h2>Start a conversation with the team behind AdGen.</h2>

              <p>
                Whether you are evaluating the platform, setting up your first
                Brand Kit, reviewing plan options, or troubleshooting a workflow,
                the goal is to give you a clear and useful answer.
              </p>

              <div className="contact-v2-support-list">
                <div>
                  <span>01</span>
                  <div>
                    <h3>Product questions</h3>
                    <p>
                      Learn how AdGen fits your workflow before choosing a plan.
                    </p>
                  </div>
                </div>

                <div>
                  <span>02</span>
                  <div>
                    <h3>Account and billing support</h3>
                    <p>
                      Get help with subscriptions, usage, access, or billing.
                    </p>
                  </div>
                </div>

                <div>
                  <span>03</span>
                  <div>
                    <h3>Feedback and ideas</h3>
                    <p>
                      Share what would make the platform more useful for your work.
                    </p>
                  </div>
                </div>
              </div>

              <div className="contact-v2-direct">
                <span>Email directly</span>
                <a href="mailto:support@adgenmcm.com">
                  support@adgenmcm.com
                </a>
                <p>Messages are reviewed by the AdGen MCM team.</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="contact-v2-form-shell">
              <div className="contact-v2-form-head">
                <span className="contact-v2-form-kicker">Send a message</span>
                <h2>Tell us what you need.</h2>
                <p>
                  Include as much context as you can so we can respond with the
                  most useful next step.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="contact-v2-form">
                <div className="contact-v2-field-grid">
                  <label className="contact-v2-field">
                    <span>Name</span>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      disabled={isSending}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="contact-v2-field">
                    <span>Email</span>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      disabled={isSending}
                      autoComplete="email"
                      required
                    />
                  </label>
                </div>

                <div className="contact-v2-field-grid">
                  <label className="contact-v2-field">
                    <span>Company <small>Optional</small></span>
                    <input
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Company or brand"
                      disabled={isSending}
                      autoComplete="organization"
                    />
                  </label>

                  <label className="contact-v2-field">
                    <span>Topic</span>
                    <select
                      name="topic"
                      value={form.topic}
                      onChange={handleChange}
                      disabled={isSending}
                    >
                      <option>General question</option>
                      <option>Product and features</option>
                      <option>Plans and pricing</option>
                      <option>Account and billing</option>
                      <option>Technical support</option>
                      <option>Feedback or partnership</option>
                    </select>
                  </label>
                </div>

                <label className="contact-v2-field">
                  <span>Message</span>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="How can we help?"
                    disabled={isSending}
                    rows={7}
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="contact-v2-submit"
                  disabled={!canSubmit}
                  aria-busy={isSending ? "true" : "false"}
                >
                  {isSending ? (
                    <>
                      <span className="contact-v2-spinner" aria-hidden="true" />
                      Sending message…
                    </>
                  ) : (
                    <>
                      Send message
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>
              </form>

              {(statusMessage || isSuccess || isError) && (
                <div
                  className={[
                    "contact-v2-status",
                    isSuccess ? "is-success" : "",
                    isError ? "is-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="status"
                  aria-live="polite"
                >
                  <span className="contact-v2-status-icon" aria-hidden="true">
                    {isSuccess ? "✓" : "!"}
                  </span>
                  <span>{statusMessage}</span>
                </div>
              )}

              <p className="contact-v2-privacy">
                Your contact details are used only to respond to your message.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="contact-v2-expectations">
        <div className="contact-v2-container">
          <Reveal>
            <div className="contact-v2-section-head">
              <span className="contact-v2-pill">What happens next</span>
              <h2>A straightforward support experience.</h2>
              <p>
                No ticket maze and no generic sales sequence—just a clear reply
                based on what you asked.
              </p>
            </div>
          </Reveal>

          <div className="contact-v2-expectation-grid">
            {[
              [
                "01",
                "Your message is reviewed",
                "We read the context you provide and route it to the right next step.",
              ],
              [
                "02",
                "You receive a direct response",
                "We respond with an answer, clarification, or recommended action.",
              ],
              [
                "03",
                "We keep the conversation useful",
                "Follow-up stays focused on helping you move forward.",
              ],
            ].map(([number, title, text], index) => (
              <Reveal key={number} delay={index * 90}>
                <article className="contact-v2-expectation-card">
                  <span>{number}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-v2-final">
        <div className="contact-v2-final-light" aria-hidden="true" />

        <div className="contact-v2-container contact-v2-final-inner">
          <Reveal>
            <span className="contact-v2-final-pill">Ready to explore AdGen?</span>

            <h2>See how the full creative workflow comes together.</h2>

            <p>
              Explore the platform, compare plans, or start with the option that
              best fits how you create today.
            </p>

            <div className="contact-v2-final-actions">
              <MarketingButton
                href="/platform"
                size="lg"
                className="contact-v2-final-primary"
              >
                Explore the platform
              </MarketingButton>

              <MarketingButton
                href="/pricing"
                size="lg"
                variant="secondary"
                className="contact-v2-final-secondary"
              >
                View pricing
              </MarketingButton>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}


