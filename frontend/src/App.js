import "./App.css";
import Navbar from "./Navbar";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AdGenerator from "./pages/AdGenerator";
import TextEditor from "./pages/TextEditor";
import ProtectedRoute from "./ProtectedRoute"; // auth-only, for /subscribe
import PaidRoute from "./PaidRoute"; // auth + active sub
import AuthForm from "./AuthForm";
import Subscribe from "./pages/Subscribe";

// NEW: Public pages
import About from "./pages/About";
import Contact from "./pages/Contact";
import Pricing from "./pages/Pricing";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

export default function App() {
  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthForm />} />

          {/* NEW: Public informational + legal pages */}
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Auth-only route to start/see subscription */}
          <Route element={<ProtectedRoute />}>
            <Route path="/subscribe" element={<Subscribe />} />
          </Route>

          {/* Paid features (require active sub) */}
          <Route element={<PaidRoute />}>
            <Route path="/adgenerator" element={<AdGenerator />} />
            <Route path="/texteditor" element={<TextEditor />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </>
  );
}







