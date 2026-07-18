import ReactGA from "react-ga4";
import Clarity from "@microsoft/clarity";

const GA_MEASUREMENT_ID = "G-YM4NSQ126N";

export function initAnalytics() {
  ReactGA.initialize(GA_MEASUREMENT_ID);
}

export function pageView(path) {
  ReactGA.send({
    hitType: "pageview",
    page: path,
  });
}

export function trackEvent(eventName, parameters = {}) {
  ReactGA.event(eventName, parameters);
}

export function initClarity() {
  Clarity.init("xoknkfazic");
}