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
import CampaignManager from "./pages/CampaignManager";
import DesignLab from "./pages/DesignLab";
import ScrollToTop from "./components/ScrollToTop";

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
    "/campaigns",
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
    <ScrollToTop />
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
          <Route path="/design-lab" element={<DesignLab />} />


          {/* Auth-only (Free + Paid) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/subscribe" element={<Subscribe />} />

            <Route element={<DashboardRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/account" element={<MyAccount />} />
              <Route path="/adgenerator" element={<AdGenerator />} />
            </Route>
          </Route>

          {/* Paid-only features */}
          <Route element={<PaidRoute />}>
            <Route element={<DashboardRoute />}>
              <Route path="/brand-kit" element={<BrandKit />} />
              <Route path="/creative-studio" element={<CreativeStudio />} />
              <Route path="/video-ads" element={<VideoAds />} />
              <Route path="/optimizer" element={<Optimizer />} />
              <Route path="/library" element={<Library />} />
              <Route path="/insights" element={<Insights />} />
            </Route>
          </Route>

          {/* Admin-only dashboard pages */}
          <Route element={<AdminRoute />}>
            <Route element={<DashboardRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/campaigns" element={<CampaignManager />} />
            </Route>
          </Route>


          {/* Fallback */}
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </>
  );
}








