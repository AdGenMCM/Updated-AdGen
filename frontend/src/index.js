// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./AuthProvider";

// New UI Styles
import "./styles/variables.css";
import "./styles/theme.css";
import "./styles/design-system.css";
import "./styles/layout.css";
import "./styles/animations.css";
import "./styles/utilities.css";

const root = ReactDOM.createRoot(
  document.getElementById("root")
);

root.render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);




