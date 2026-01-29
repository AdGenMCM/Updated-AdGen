import "./App.css";
import Navbar from "./Navbar";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AdGenerator from "./pages/AdGenerator";
import TextEditor from "./pages/TextEditor";
import ProtectedRoute from "./ProtectedRoute"; // auth-only, for /subscribe
import PaidRoute from "./PaidRoute";           // auth + active sub
import AuthForm from "./AuthForm";
import Subscribe from "./pages/Subscribe";

export default function App() {
  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthForm />} />

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






