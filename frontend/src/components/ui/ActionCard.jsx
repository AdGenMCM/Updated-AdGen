import React from "react";
import { Link } from "react-router-dom";
import Card from "./Card";
import "./ui.css";

export default function ActionCard({
  to,
  icon,
  title,
  description,
}) {
  return (
    <Link to={to} className="ui-action-link">
      <Card className="ui-action-card">
        <div className="ui-action-top">
          <div className="ui-action-icon">
            {icon}
          </div>

          <span className="ui-action-arrow">
            →
          </span>
        </div>

        <h3>{title}</h3>

        <p>{description}</p>
      </Card>
    </Link>
  );
}