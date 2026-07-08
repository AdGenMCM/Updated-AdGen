import "./ui.css";

export default function StepSection({
  step,
  title,
  description,
  children,
}) {
  return (
    <section className="form-section">
      <div className="section-heading">
        <span className="step-badge">
          {step}
        </span>

        <div>
          <h2>{title}</h2>

          {description && (
            <p>{description}</p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}