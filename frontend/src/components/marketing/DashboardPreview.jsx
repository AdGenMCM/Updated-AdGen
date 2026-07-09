import React from "react";
import "./DashboardPreview.css";

export default function DashboardPreview() {
  return (
    <div className="adgen-dashboard-preview">
      <aside className="adgen-preview-sidebar">
        <div className="adgen-preview-brand">AdGen</div>

        <nav className="adgen-preview-nav">
          <span className="active">Dashboard</span>
          <span>Brand Kit</span>
          <span>Generator</span>
          <span>Studio</span>
          <span>Insights</span>
        </nav>
      </aside>

      <div className="adgen-preview-main">
        <header className="adgen-preview-header">
          <div>
            <p>Creative Platform</p>
            <h3>Welcome back, Matthew</h3>
          </div>

          <button type="button">Generate Creative</button>
        </header>

        <section className="adgen-preview-metrics">
          <div>
            <span>Images</span>
            <strong>42</strong>
            <small>+12 this week</small>
          </div>

          <div>
            <span>Videos</span>
            <strong>9</strong>
            <small>3 ready to export</small>
          </div>

          <div>
            <span>Best CTR</span>
            <strong>4.8%</strong>
            <small>Meta campaign</small>
          </div>
        </section>

        <section className="adgen-preview-body">
          <div className="adgen-preview-creative">
            <div className="adgen-preview-ad">
              <div className="adgen-preview-ad-glow" />
              <div className="adgen-preview-ad-copy">
                <span>New Creative</span>
                <strong>Premium product ad</strong>
                <small>Generated with Brand Kit</small>
              </div>
            </div>
          </div>

          <div className="adgen-preview-panel">
            <div className="adgen-preview-panel-header">
              <span>Workflow</span>
              <strong>Live progress</strong>
            </div>

            <div className="adgen-preview-steps">
              <div className="done">Brand Kit applied</div>
              <div className="done">Creative generated</div>
              <div className="active">Insights updating</div>
              <div>Optimizer ready</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}