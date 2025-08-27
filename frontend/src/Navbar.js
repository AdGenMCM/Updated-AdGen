// src/Navbar.js
import "./Navbar.css";
import { Link, useMatch, useResolvedPath } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="nav">
      <Link to="/" className="site-title">AdGen MCM</Link>
      <ul>
        <CustomLink to="/adgenerator">Ad Generator</CustomLink>
        <CustomLink to="/texteditor">Text Editor</CustomLink>
      </ul>
    </nav>
  );
}

function CustomLink({ to, children, ...props }) {
  const resolved = useResolvedPath(to);
  const match = useMatch({ path: resolved.pathname, end: true });
  return (
    <li className={match ? "active" : ""}>
      <Link to={to} {...props}>{children}</Link>
    </li>
  );
}
