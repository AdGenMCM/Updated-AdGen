import React, { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../firebaseConfig";
import "./FeatureTutorial.css";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();
const LOCAL_PREFIX = "adgen:tutorial-seen:";

function localKey(uid, feature) {
  return `${LOCAL_PREFIX}${uid || "anonymous"}:${feature}`;
}

export default function FeatureTutorial({
  feature,
  title,
  description,
  videoSrc,
  durationLabel,
  buttonLabel = "How to use",
}) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [seen, setSeen] = useState(false);
  const [openedAutomatically, setOpenedAutomatically] = useState(false);
  const videoRef = useRef(null);

  const markSeen = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    setSeen(true);
    try {
      window.localStorage.setItem(localKey(user.uid, feature), "1");
    } catch {}

    try {
      const token = await user.getIdToken();
      await fetch(`${API_BASE}/users/me/tutorials/${encodeURIComponent(feature)}/seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn("Could not persist tutorial state to the server:", err);
    }
  }, [feature]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (cancelled) return;
      if (!user) {
        setChecking(false);
        return;
      }

      let alreadySeen = false;
      try {
        alreadySeen = window.localStorage.getItem(localKey(user.uid, feature)) === "1";
      } catch {}

      if (!alreadySeen) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`${API_BASE}/users/me/tutorials`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            alreadySeen = Boolean(data?.tutorialsSeen?.[feature]);
            if (alreadySeen) {
              try {
                window.localStorage.setItem(localKey(user.uid, feature), "1");
              } catch {}
            }
          }
        } catch (err) {
          console.warn("Could not load tutorial state from the server:", err);
        }
      }

      if (cancelled) return;
      setSeen(alreadySeen);
      setChecking(false);

      if (!alreadySeen) {
        setOpenedAutomatically(true);
        setOpen(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [feature]);

  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [open]);

  const closeTutorial = async () => {
    if (openedAutomatically && !seen) {
      await markSeen();
    }
    setOpen(false);
    setOpenedAutomatically(false);
  };

  const handleManualOpen = () => {
    setOpenedAutomatically(false);
    setOpen(true);
  };

  const handleEnded = async () => {
    if (!seen) await markSeen();
  };

  return (
    <>
      <button
        type="button"
        className="featureTutorialHelpButton"
        onClick={handleManualOpen}
        disabled={checking}
        aria-label={`Open ${title} tutorial`}
      >
        <span className="featureTutorialPlayIcon" aria-hidden="true">▶</span>
        {buttonLabel}
      </button>

      {open && (
        <div className="featureTutorialOverlay" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeTutorial();
        }}>
          <section
            className="featureTutorialModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${feature}-tutorial-title`}
          >
            <button
              type="button"
              className="featureTutorialClose"
              onClick={closeTutorial}
              aria-label="Close tutorial"
            >
              ×
            </button>

            <div className="featureTutorialIntro">
              <span className="featureTutorialEyebrow">QUICK WALKTHROUGH</span>
              <h2 id={`${feature}-tutorial-title`}>{title}</h2>
              <p>{description}</p>
              {durationLabel && <span className="featureTutorialDuration">{durationLabel}</span>}
            </div>

            <div className="featureTutorialVideoWrap">
              <video
                ref={videoRef}
                className="featureTutorialVideo"
                src={videoSrc}
                controls
                playsInline
                preload="metadata"
                onEnded={handleEnded}
              >
                Your browser does not support embedded video.
              </video>
            </div>

            <div className="featureTutorialFooter">
              <p>You can reopen this walkthrough anytime with the <strong>How to use</strong> button.</p>
              <button type="button" className="featureTutorialDoneButton" onClick={closeTutorial}>
                {seen || !openedAutomatically ? "Close" : "Skip for now"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
