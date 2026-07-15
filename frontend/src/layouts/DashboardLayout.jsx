import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  NavLink,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useWorkspace } from "../context/WorkspaceContext";

import { signOut } from "firebase/auth";
import { auth, db } from "../firebaseConfig";

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import {
  Sparkles,
  Wand2,
  Clapperboard,
  BarChart3,
  Library,
  LineChart,
  Palette,
  Brush,
  FolderKanban,
  CircleHelp,
  Settings,
  Bell,
  Plus,
  ChevronDown,
  LogOut,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Menu,
  CheckCheck,
} from "lucide-react";

import "../styles/dashboard-layout.css";


export default function DashboardLayout({ children }) {
  const location = useLocation();
  const accountRef = useRef(null);

  const notificationRef = useRef(null);

  const navigate = useNavigate();

  const [notificationOpen, setNotificationOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);

  const [notificationsLoading, setNotificationsLoading] =
    useState(true);

  const [notificationBusy, setNotificationBusy] =
    useState(false);

  const [notificationError, setNotificationError] =
    useState("");

  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const {
    usage,
    videoUsage,
    planLabel,
  } = useWorkspace() || {};

  const fullName = auth.currentUser?.displayName || "";
  const email = auth.currentUser?.email || "";

  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .map((name) => name[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    email.charAt(0).toUpperCase() ||
    "U";

  const imageUsed = usage?.used ?? 0;
  const imageCap = usage?.cap ?? 0;
  const videoUsed = videoUsage?.used ?? 0;
  const videoCap = videoUsage?.cap ?? 0;

  const imagePct = imageCap
    ? Math.min(100, Math.round((imageUsed / imageCap) * 100))
    : 0;

  const videoPct = videoCap
    ? Math.min(100, Math.round((videoUsed / videoCap) * 100))
    : 0;

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: Sparkles },
    { to: "/adgenerator", label: "Image Generator", icon: Wand2 },
    { to: "/video-ads", label: "Video Generator", icon: Clapperboard },
    { to: "/creative-studio", label: "Creative Studio", icon: Brush },
    { to: "/optimizer", label: "Optimizer", icon: BarChart3 },
    { to: "/library", label: "Library", icon: Library },
    { to: "/insights", label: "Insights", icon: LineChart },
    { to: "/brand-kit", label: "Brand Kit", icon: Palette },
    {
      to: "/projects",
      label: "Projects",
      icon: FolderKanban,
      disabled: true,
    },
  ];

  const currentPage =
    navItems.find((item) => item.to === location.pathname)?.label ||
    (location.pathname === "/account" ? "My Account" : "Workspace");

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => !n.read).length,
    [notifications]
  );

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setMobileSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
  const uid = auth.currentUser?.uid;

  if (!uid) {
    setNotifications([]);
    setNotificationsLoading(false);
    return;
  }

  const q = query(
    collection(db, "users", uid, "notifications"),
    orderBy("createdAt", "desc"),
    limit(25)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      setNotifications(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );

      setNotificationsLoading(false);
    },
    () => {
      setNotificationError(
        "Unable to load notifications."
      );

      setNotificationsLoading(false);
    }
  );
}, []);

const markRead = async (notification) => {
  if (
    notification.read ||
    !auth.currentUser
  )
    return;

  await updateDoc(
    doc(
      db,
      "users",
      auth.currentUser.uid,
      "notifications",
      notification.id
    ),
    {
      read: true,
      readAt: new Date(),
    }
  );
};

const markAllRead = async () => {
  if (notificationBusy) return;

  setNotificationBusy(true);

  const batch = writeBatch(db);

  notifications
    .filter((n) => !n.read)
    .forEach((notification) => {
      batch.update(
        doc(
          db,
          "users",
          auth.currentUser.uid,
          "notifications",
          notification.id
        ),
        {
          read: true,
          readAt: new Date(),
        }
      );
    });

  await batch.commit();

  setNotificationBusy(false);
};

  return (
    <div
      className={[
        "dash-shell",
        sidebarCollapsed ? "is-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {mobileSidebarOpen && (
        <button
          type="button"
          className="dash-mobile-overlay"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={[
          "dash-sidebar",
          mobileSidebarOpen ? "is-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="dash-sidebar-head">
          <Link to="/" className="dash-brand">
            <span className="dash-brand-mark">
              <Sparkles size={17} />
            </span>

            {!sidebarCollapsed && (
              <span className="dash-brand-copy">
                <strong>ADGen MCM</strong>
                <small>Creative workspace</small>
              </span>
            )}
          </Link>

          <button
            type="button"
            className="dash-sidebar-collapse"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>

          <button
            type="button"
            className="dash-sidebar-mobile-close"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <Link to="/adgenerator" className="dash-new-button">
          <Plus size={17} />
          {!sidebarCollapsed && <span>New creative</span>}
        </Link>

        {!sidebarCollapsed && (
          <span className="dash-nav-section-label">Workspace</span>
        )}

        <nav className="dash-nav" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="dash-nav-link disabled"
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="dash-nav-icon">
                    <Icon size={17} />
                  </span>

                  {!sidebarCollapsed && (
                    <>
                      <span>{item.label}</span>
                      <span className="dash-soon">Soon</span>
                    </>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `dash-nav-link ${isActive ? "active" : ""}`
                }
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="dash-nav-icon">
                  <Icon size={17} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="dash-sidebar-spacer" />

        {!sidebarCollapsed && (
          <div className="dash-sidebar-card">
            <div className="dash-sidebar-card-head">
              <span>Workspace usage</span>
              <strong>{planLabel}</strong>
            </div>

            <div className="dash-usage-group">
              <div className="dash-usage-row">
                <span>Images</span>
                <strong>
                  {imageUsed} / {imageCap}
                </strong>
              </div>
              <div className="dash-usage-bar">
                <span style={{ width: `${imagePct}%` }} />
              </div>
            </div>

            <div className="dash-usage-group">
              <div className="dash-usage-row">
                <span>Video credits</span>
                <strong>
                  {videoUsed} / {videoCap}
                </strong>
              </div>
              <div className="dash-usage-bar">
                <span style={{ width: `${videoPct}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="dash-sidebar-footer">
          <Link
            to="/contact"
            className="dash-footer-link"
            title={sidebarCollapsed ? "Help & Support" : undefined}
          >
            <CircleHelp size={17} />
            {!sidebarCollapsed && <span>Help & Support</span>}
          </Link>

          <Link
            to="/account"
            className="dash-footer-link"
            title={sidebarCollapsed ? "Settings" : undefined}
          >
            <Settings size={17} />
            {!sidebarCollapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-left">
            <button
              type="button"
              className="dash-mobile-menu"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={19} />
            </button>

            <div>
              <span className="dash-route-label">Workspace</span>
              <h2>{currentPage}</h2>
            </div>
          </div>

          <div className="dash-topbar-actions">
            <Link to="/pricing" className="dash-upgrade-btn">
              Upgrade plan
            </Link>

            <div
              className="dash-notification-menu"
              ref={notificationRef}
            >
              <button
                className="dash-icon-btn"
                type="button"
                onClick={() =>
                  setNotificationOpen(!notificationOpen)
                }
              >
                <Bell size={17} />

                {unreadCount > 0 && (
                  <span className="dash-notification-count">
                    {unreadCount > 9
                      ? "9+"
                      : unreadCount}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="dash-notification-panel">

                  <div className="dash-notification-head">

                    <strong>Notifications</strong>

                    {unreadCount > 0 && (
                      <button onClick={markAllRead}>
                        <CheckCheck size={14}/>
                        Mark all read
                      </button>
                    )}

                  </div>

                  <div className="dash-notification-list">

                  {notificationsLoading && (
                  <div className="dash-notification-state">
                  Loading...
                  </div>
                  )}

                  {notificationError && (
                    <div className="dash-notification-state">
                      {notificationError}
                    </div>
                  )}

                  {!notificationsLoading &&
                    !notificationError &&
                    notifications.length === 0 && (
                      <div className="dash-notification-state">
                        No notifications yet.
                      </div>
                  )}

                  {notifications.map((notification)=>(

                  <button
                  key={notification.id}
                  className={`dash-notification-item ${
                  notification.read ? "" : "is-unread"
                  }`}
                  onClick={async()=>{

                  await markRead(notification);

                  setNotificationOpen(false);

                  if(notification.link){

                  navigate(notification.link);

                  }

                  }}

                  >

                  <div className="dash-notification-copy">

                  <strong>

                  {notification.title}

                  </strong>

                  <p>

                  {notification.body}

                  </p>

                  </div>

                  </button>

                  ))}

                  </div>

                  {/* header */}

                  {/* notifications */}

                  {/* footer */}

                </div>
              )}

            </div>

            <div className="dash-account-menu" ref={accountRef}>
              <button
                type="button"
                className="dash-account-toggle"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
              >
                <span className="dash-avatar">{initials}</span>

                <span className="dash-account-copy">
                  <strong>{fullName || "AdGen user"}</strong>
                  <small>{planLabel}</small>
                </span>

                <ChevronDown size={15} />
              </button>

              {accountOpen && (
                <div className="dash-account-dropdown" role="menu">
                  <div className="dash-account-summary">
                    <span>{fullName || "AdGen user"}</span>
                    <small>{email}</small>
                  </div>

                  <Link
                    to="/account"
                    onClick={() => setAccountOpen(false)}
                    role="menuitem"
                  >
                    <Settings size={16} />
                    My Account
                  </Link>

                  <Link
                    to="/brand-kit"
                    onClick={() => setAccountOpen(false)}
                    role="menuitem"
                  >
                    <Palette size={16} />
                    Brand Kit
                  </Link>

                  <Link
                    to="/pricing"
                    onClick={() => setAccountOpen(false)}
                    role="menuitem"
                  >
                    <CreditCard size={16} />
                    Billing & Plans
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      signOut(auth);
                    }}
                    role="menuitem"
                  >
                    <LogOut size={16} />
                    Sign out
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