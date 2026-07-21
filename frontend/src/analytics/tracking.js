import ReactGA from "react-ga4";
import Clarity from "@microsoft/clarity";

const GA_MEASUREMENT_ID = "G-YM4NSQ126N";
const LINKEDIN_PARTNER_ID = "9387882";

let linkedInInitialized = false;

export function initAnalytics() {
  ReactGA.initialize(GA_MEASUREMENT_ID);

  initLinkedInInsight();
}

function initLinkedInInsight() {
  if (linkedInInitialized) return;
  linkedInInitialized = true;

  window._linkedin_partner_id = LINKEDIN_PARTNER_ID;

  window._linkedin_data_partner_ids =
    window._linkedin_data_partner_ids || [];

  window._linkedin_data_partner_ids.push(
    LINKEDIN_PARTNER_ID
  );

  if (window.lintrk) return;

  window.lintrk = function (a, b) {
    window.lintrk.q.push([a, b]);
  };

  window.lintrk.q = [];

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.async = true;
  script.src =
    "https://snap.licdn.com/li.lms-analytics/insight.min.js";

  document.head.appendChild(script);
}

export function pageView(path) {
  ReactGA.send({
    hitType: "pageview",
    page: path,
  });
}

export function trackEvent(eventName, parameters = {}) {
  // Google Analytics
  ReactGA.event(eventName, parameters);

  // LinkedIn Conversion Tracking
  if (window.lintrk) {
    switch (eventName) {
      case "signup_completed":
        window.lintrk("track", {
          conversion_id: 28735858,
        });
        break;

      default:
        break;
    }
  }
}

export function initClarity() {
  Clarity.init("xoknkfazic");
}