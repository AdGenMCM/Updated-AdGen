import React from "react";
import { Link } from "react-router-dom";
import Card from "./Card";
import "./ui.css";

export default function StatCard({ label, value, description, icon, to }) {
  const content = (
    <Card className={`ui-stat-card ${to ? "ui-stat-card-clickable" : ""}`}>
      <div className="ui-stat-icon">{icon}</div>
      <p>{label}</p>
      <h3>{value}</h3>
      <span>{description}</span>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="ui-stat-link">
        {content}
      </Link>
    );
  }

  return content;
}