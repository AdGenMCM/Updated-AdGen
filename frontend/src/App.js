import "./App.css";
import { Routes, Route, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";

import Home from "./pages/Home";
import AdGenerator from "./pages/AdGenerator";
import ProtectedRoute from "./ProtectedRoute";
import PaidRoute from "./PaidRoute";
import AuthForm from "./AuthForm";
import Subscribe from "./pages/Subscribe";
import MyAccount from "./pages/MyAccount";
import VideoAdsV2 from "./pages/VideoAdsV2";
import Library from "./pages/Library";
import Insights from "./pages/Insights";
import Reports from "./pages/Reports";
import BrandKit from "./pages/BrandKit";
import Dashboard from "./pages/Dashboard";
import CreativeStudio from "./pages/CreativeStudio";
import CampaignManager from "./pages/CampaignManager";
import DesignLab from "./pages/DesignLab";
import ScrollToTop from "./components/ScrollToTop";

// Public pages
import About from "./pages/About";
import Contact from "./pages/Contact";
import Pricing from "./pages/Pricing";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Platform from "./pages/Platform";
import Examples from "./pages/Examples";
import RetentionFeedback from "./pages/RetentionFeedback";

import Optimizer from "./pages/Optimizer";

// Shared public layouts
import Navbar from "./Navbar";
import MarketingLayout from "./components/marketing/layout/MarketingLayout";

// Admin imports
import AdminRoute from "./AdminRoute";
import AdminUsers from "./pages/AdminUsers";
import AdminCreative from "./pages/AdminCreative";
import AdminFeedback from "./pages/AdminFeedback";

// App styling
import DashboardRoute from "./components/DashboardRoute";
import "./styles/animations.css";

// Analytics
import {
  initAnalytics,
  pageView,
  initClarity,
} from "./analytics/tracking";

function AnalyticsPageView() {
  const location = useLocation();

  useEffect(() => {
    pageView(location.pathname + location.search);

    if (window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [location.pathname, location.search]);

  return null;
}

// Preserves the existing marketing navbar on public utility flows that
// should not receive the full marketing footer.
function NavbarOnlyLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

export default function App() {
  useEffect(() => {
    initAnalytics();
    initClarity();
  }, []);

  return (
    <>
      <ScrollToTop />
      <AnalyticsPageView />

      <div className="container">
        <Routes>
          {/* Public marketing + legal pages share one navbar/footer layout */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/platform" element={<Platform />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/feedback/retention" element={<RetentionFeedback />} />
          </Route>

          {/* Public utility pages keep the navbar but no site footer */}
          <Route element={<NavbarOnlyLayout />}>
            <Route path="/login" element={<AuthForm />} />
            <Route path="/design-lab" element={<DesignLab />} />

            {/* Auth-only subscribe flow */}
            <Route element={<ProtectedRoute />}>
              <Route path="/subscribe" element={<Subscribe />} />
            </Route>
          </Route>

          {/* Auth-only workspace */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/account" element={<MyAccount />} />
              <Route path="/adgenerator" element={<AdGenerator />} />
              <Route path="/video-ads" element={<VideoAdsV2 />} />
            </Route>
          </Route>

          {/* Paid users */}
          <Route element={<PaidRoute />}>
            <Route element={<DashboardRoute />}>
              <Route path="/brand-kit" element={<BrandKit />} />
              <Route path="/creative-studio" element={<CreativeStudio />} />
              <Route path="/optimizer" element={<Optimizer />} />
              <Route path="/library" element={<Library />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
          </Route>

          {/* Admin-only dashboard pages */}
          <Route element={<AdminRoute />}>
            <Route element={<DashboardRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/creative" element={<AdminCreative />} />
              <Route path="/admin/feedback" element={<AdminFeedback />} />
              <Route path="/campaigns" element={<CampaignManager />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route element={<MarketingLayout />}>
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </div>
    </>
  );
}
