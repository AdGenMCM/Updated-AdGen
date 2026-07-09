import "./App.css";
import Navbar from "./Navbar";
import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Home from "./pages/Home";
import AdGenerator from "./pages/AdGenerator";
import ProtectedRoute from "./ProtectedRoute"; // auth-only, for /subscribe
import PaidRoute from "./PaidRoute"; // auth + active sub
import AuthForm from "./AuthForm";
import Subscribe from "./pages/Subscribe";
import MyAccount from "./pages/MyAccount";
import VideoAds from "./pages/VideoAds";
import Library from "./pages/Library";
import Insights from "./pages/Insights";
import BrandKit from "./pages/BrandKit";
import Dashboard from "./pages/Dashboard";
import CreativeStudio from "./pages/CreativeStudio";

// NEW: Public pages
import About from "./pages/About";
import Contact from "./pages/Contact";
import Pricing from "./pages/Pricing";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Platform from "./pages/Platform";

import Optimizer from "./pages/Optimizer";

//Admin Imports 
import AdminRoute from "./AdminRoute";
import AdminUsers from "./pages/AdminUsers";

//App Styling 
import DashboardRoute from "./components/DashboardRoute";
import "./styles/animations.css";

// Meta Pixel tracking component
function MetaPixelPageView() {
  const location = useLocation();

  useEffect(() => {
    if (window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [location.pathname, location.search]);

  return null;
}

function ConditionalNavbar() {
  const location = useLocation();

  const dashboardRoutes = [
    "/dashboard",
    "/adgenerator",
    "/video-ads",
    "/creative-studio",
    "/optimizer",
    "/library",
    "/insights",
    "/brand-kit",
    "/account",
    "/admin/users",
  ];

  const isDashboardRoute = dashboardRoutes.some((route) =>
    location.pathname.startsWith(route)
  );

  return isDashboardRoute ? null : <Navbar />;
}

export default function App() {
  return (
    <>
    <ConditionalNavbar />
    <div className="container">
        <MetaPixelPageView />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthForm />} />

          {/* Public informational + legal pages */}
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/platform" element={<Platform />} />

          {/* Auth-only */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
            <Route path="/subscribe" element={<Subscribe />} />
            <Route path="/account" element={<MyAccount />} />
            <Route path="/brand-kit" element={<DashboardRoute><BrandKit /></DashboardRoute>} />
            <Route path="/optimizer" element={<DashboardRoute><Optimizer /></DashboardRoute>} />
            <Route path="/library" element={<DashboardRoute><Library /></DashboardRoute>} />
            <Route path="/insights" element={<DashboardRoute><Insights /></DashboardRoute>} />
          </Route>

          {/* Paid features (require active sub) */}
          <Route element={<PaidRoute />}>
            <Route path="/adgenerator" element={<DashboardRoute><AdGenerator /></DashboardRoute>} />
            <Route path="/creative-studio" element={<DashboardRoute><CreativeStudio /></DashboardRoute>} />
            <Route path="/video-ads" element={<DashboardRoute><VideoAds /></DashboardRoute>} />
          </Route>

          {/* Admin */}
          <Route element={<AdminRoute />}>
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>


          {/* Fallback */}
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </>
  );
}








