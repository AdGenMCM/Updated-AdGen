import React from "react";
import "./LearningUpdateSummary.css";

function pct(value) {
  const number = Number(value || 0);
  return `${Math.round((number <= 1 ? number * 100 : number))}%`;
}

function title(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function LearningUpdateSummary({ refresh, timeline = [] }) {
  if (!refresh) return null;
  const changes = refresh.learningChanges || {};
  const profileChanges = Object.entries(changes.profileChanges || {});
  const before = refresh.before || {};
  const after = refresh.after || {};

  return (
    <div className="lus-wrap">
      <article className="lus-card">
        <div className="lus-head">
          <div>
            <span>Latest learning update</span>
            <h3>ADGen learned from your newest results</h3>
          </div>
          <span className={`lus-status ${refresh.status || "completed"}`}>{refresh.status || "completed"}</span>
        </div>

        <div className="lus-stats">
          <div><span>New evidence</span><strong>+{changes.added || 0}</strong></div>
          <div><span>Updated</span><strong>{changes.updated || 0}</strong></div>
          <div><span>Unchanged</span><strong>{changes.unchanged || 0}</strong></div>
          <div><span>New winners</span><strong>+{changes.newWinners || 0}</strong></div>
        </div>

        <div className="lus-confidence">
          <div><span>Confidence before</span><strong>{pct(before.confidence)}</strong></div>
          <span className="lus-arrow">→</span>
          <div><span>Confidence after</span><strong>{pct(after.confidence)}</strong></div>
          <em className={Number(changes.confidenceDelta || 0) >= 0 ? "up" : "down"}>
            {Number(changes.confidenceDelta || 0) >= 0 ? "+" : ""}{pct(changes.confidenceDelta)}
          </em>
        </div>

        {profileChanges.length > 0 && (
          <div className="lus-profileChanges">
            <h4>Creative DNA changes</h4>
            {profileChanges.map(([key, value]) => (
              <div key={key}>
                <span>{title(key)}</span>
                <p>{value.before ? title(value.before) : "No prior leader"} <b>→</b> {title(value.after)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="lus-recommendation">
          <span>Recommendation</span>
          <p>{changes.recommendation || "Continue collecting performance data to strengthen ADGen's learning signal."}</p>
        </div>
      </article>

      {timeline.length > 0 && (
        <article className="lus-card lus-timeline">
          <div className="lus-head"><div><span>Learning timeline</span><h3>How ADGen has grown smarter</h3></div></div>
          <div className="lus-timelineList">
            {timeline.slice(0, 8).map((session) => {
              const sessionChanges = session.learningChanges || {};
              const sessionAfter = session.after || {};
              return (
                <div key={session.id}>
                  <span className="lus-dot" />
                  <div>
                    <strong>{session.finishedAt ? new Date(session.finishedAt * 1000).toLocaleString() : "Refresh in progress"}</strong>
                    <p>+{sessionChanges.added || 0} new · {sessionChanges.updated || 0} updated · confidence {pct(sessionAfter.confidence)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}
    </div>
  );
}
