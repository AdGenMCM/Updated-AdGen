// src/App.js
import "./App.css";
import Navbar from "./Navbar";
import { Routes, Route } from "react-router-dom";

// 👇 import from pages/
import Home from "./pages/Home";
import AdGenerator from "./pages/AdGenerator";
import TextEditor from "./pages/TextEditor";

export default function App() {
  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/adgenerator" element={<AdGenerator />} />
          <Route path="/texteditor" element={<TextEditor />} />
        </Routes>
      </div>
    </>
  );
}



