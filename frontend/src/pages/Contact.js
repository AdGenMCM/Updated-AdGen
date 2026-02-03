import { useMemo, useState } from "react";
import "./Contact.css";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  // status: "idle" | "sending" | "success" | "error"
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const isSending = status === "sending";
  const isSuccess = status === "success";
  const isError = status === "error";

  //deployed backend URL:
  const API_BASE = "https://updated-adgen.onrender.com";

  const canSubmit = useMemo(() => {
    return form.name.trim() && form.email.trim() && form.message.trim() && !isSending;
  }, [form, isSending]);

  const handleChange = (e) => {
    setStatus("idle");
    setStatusMessage("");
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("sending");
    setStatusMessage("");

    try {
      const res = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.message.trim(),
        }),
      });

      if (!res.ok) {
        // try to pull FastAPI detail if present
        let detail = "";
        try {
          const data = await res.json();
          detail = data?.detail ? ` (${data.detail})` : "";
        } catch {
          /* ignore */
        }
        throw new Error(`Request failed${detail}`);
      }

      setStatus("success");
      setStatusMessage("Message sent — we’ll get back to you shortly.");
      setForm({ name: "", email: "", message: "" });

      // Optional: auto-hide success after a few seconds
      setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
      }, 4500);
    } catch (err) {
      setStatus("error");
      setStatusMessage("Something went wrong. Please try again in a moment.");
    }
  };

  return (
    <section className="contact">
      <div className="contact__card">
        <div className="contact__header">
          <h2 className="contact__title">Contact Us</h2>
          <p className="contact__subtitle">
            Send a message and we’ll respond as soon as we can.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="contact__form">
          <label className="contact__field">
            <span className="contact__label">Name</span>
            <input
              name="name"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              disabled={isSending}
              autoComplete="name"
              required
            />
          </label>

          <label className="contact__field">
            <span className="contact__label">Email</span>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              disabled={isSending}
              autoComplete="email"
              required
            />
          </label>

          <label className="contact__field">
            <span className="contact__label">Message</span>
            <textarea
              name="message"
              placeholder="How can we help?"
              value={form.message}
              onChange={handleChange}
              disabled={isSending}
              rows={6}
              required
            />
          </label>

          <button
            type="submit"
            className="contact__button"
            disabled={!canSubmit}
            aria-busy={isSending ? "true" : "false"}
          >
            {isSending ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Sending…
              </>
            ) : (
              "Send Message"
            )}
          </button>
        </form>

        {/* Status / success animation */}
        {(statusMessage || isSuccess || isError) && (
          <div
            className={[
              "contact__status",
              isSuccess ? "is-success" : "",
              isError ? "is-error" : "",
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            {isSuccess && (
              <span className="successMark" aria-hidden="true">
                <span className="successMark__circle" />
                <span className="successMark__check" />
              </span>
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        <p className="contact__alt">
          Or email us directly:{" "}
          <a className="contact__link" href="mailto:adgenmcm@gmail.com">
            adgenmcm@gmail.com
          </a>
        </p>
      </div>
    </section>
  );
}


