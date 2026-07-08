import React, { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";
import {
  Sparkles,
  Wand2,
  Clapperboard,
  BarChart3,
  Library,
  LineChart,
  Palette,
  FolderKanban,
  CircleHelp,
  Settings,
  Bell,
  Plus,
} from "lucide-react";
import "../styles/dashboard-layout.css";

export default function DashboardLayout({ children }) {
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);

  const { usage, videoUsage, planLabel } = useWorkspace() || {};
  const fullName = auth.currentUser?.displayName || "";

  const initials =
  fullName
    .trim()
    .split(/\s+/)
    .map((name) => name[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

    const imageUsed = usage?.used ?? 0;
    const imageCap = usage?.cap ?? 0;
    const videoUsed = videoUsage?.used ?? 0;
    const videoCap = videoUsage?.cap ?? 0;

    const imagePct = imageCap ? Math.min(100, Math.round((imageUsed / imageCap) * 100)) : 0;
    const videoPct = videoCap ? Math.min(100, Math.round((videoUsed / videoCap) * 100)) : 0;

  const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: Sparkles,
  },
  {
    to: "/adgenerator",
    label: "Image Generator",
    icon: Wand2,
  },
  {
    to: "/video-ads",
    label: "Video Generator",
    icon: Clapperboard,
  },
  {
    to: "/optimizer",
    label: "Optimizer",
    icon: BarChart3,
  },
  {
    to: "/library",
    label: "Library",
    icon: Library,
  },
  {
    to: "/insights",
    label: "Insights",
    icon: LineChart,
  },
  {
    to: "/brand-kit",
    label: "Brand Kit",
    icon: Palette,
  },
  {
    to: "/projects",
    label: "Projects",
    icon: FolderKanban,
    disabled: true,
  },
];

  const currentPage =
    navItems.find((item) => item.to === location.pathname)?.label || "Dashboard";

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <Link to="/dashboard" className="dash-brand">
          <span className="dash-brand-mark">
            <Sparkles size={18} />
          </span>
          <span>ADGen MCM</span>
        </Link>

        <Link to="/adgenerator" className="dash-new-button">
          <Plus size={18} />
          <span>New Ad</span>
        </Link>

        <nav className="dash-nav">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div key={item.to} className="dash-nav-link disabled">
                  <span className="dash-nav-icon">
                    <Icon size={17} />
                  </span>
                  <span>{item.label}</span>
                  <span className="dash-soon">Soon</span>
                </div>
              );
            }

            return (
              <NavLink key={item.to} to={item.to} className="dash-nav-link">
                <span className="dash-nav-icon">
                  <Icon size={17} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="dash-sidebar-card">
            <div className="dash-sidebar-card-title">Workspace</div>

            <div className="dash-plan-pill">{planLabel}</div>

            <div className="dash-usage-row">
                <strong>{imageUsed} / {imageCap}</strong>
                <span>Image Credits</span>
            </div>
            <div className="dash-usage-bar">
                <span style={{ width: `${imagePct}%` }} />
            </div>

            <div className="dash-usage-row video">
                <strong>{videoUsed} / {videoCap}</strong>
                <span>Video Credits</span>
            </div>
            <div className="dash-usage-bar">
                <span style={{ width: `${videoPct}%` }} />
            </div>
        </div>

        <div className="dash-sidebar-footer">
          <Link to="/contact" className="dash-footer-link">
            <CircleHelp size={17} />
            <span>Help & Support</span>
          </Link>

          <Link to="/account" className="dash-footer-link">
            <Settings size={17} />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div>
            <span className="dash-route-label">Workspace</span>
            <h2>{currentPage}</h2>
          </div>

          <div className="dash-topbar-actions">
            <Link to="/pricing" className="dash-upgrade-btn">
              Upgrade Plan
            </Link>

            <button className="dash-icon-btn" type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>

            <div className="dash-account-menu">
                <button
                    type="button"
                    className="dash-avatar"
                    onClick={() => setAccountOpen((v) => !v)}
                >
                    {initials}
                </button>
                
                {accountOpen && (
                    <div className="dash-account-dropdown">
                    <Link to="/account" onClick={() => setAccountOpen(false)}>
                        My Account
                    </Link>

                    <Link to="/brand-kit" onClick={() => setAccountOpen(false)}>
                        Brand Kit
                    </Link>

                    <Link to="/pricing" onClick={() => setAccountOpen(false)}>
                        Billing & Plans
                    </Link>

                    <button
                        type="button"
                        onClick={() => {
                        setAccountOpen(false);
                        signOut(auth);
                        }}
                    >
                        Sign Out
                    </button>
                    </div>
                )}
                </div>
          </div>
        </header>

        <main className="dash-content">{children}</main>
      </div>
    </div>
  );
}