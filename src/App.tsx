import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Home from "./pages/Home";
import ModDetail from "./pages/ModDetail";
import Ideas from "./pages/Ideas";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Submissions from "./pages/Submissions";
import Landing from "./pages/Landing";
import BubbleBears from "./components/BubbleBears";
import SettingsPopover, { BearSettings } from "./components/SettingsPopover";
import { loadBearSettings } from "./lib/bearSettings";
import { useAuth } from "./context/AuthContext";
import { fetchPendingIssues } from "./lib/data";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = pathname.startsWith("/lucidblocks") ? "Lucid Blocks Mods" : "Putzwirk's page";
  }, [pathname]);
  return null;
}

function LucidLayout() {
  const location = useLocation();
  const { session, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!session) { setPendingCount(0); return; }
    const refreshPendingCount = () => fetchPendingIssues().then((items) => setPendingCount(items.length)).catch(() => undefined);
    refreshPendingCount();
    const timer = window.setInterval(refreshPendingCount, 5000);
    return () => window.clearInterval(timer);
  }, [session]);
  const [beeMessages, setBeeMessages] = useState<Array<{ id: number; text: string; x: number; y: number; opacity: number }>>([]);
  useEffect(() => {
    const showMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; text: string; x: number; y: number }>).detail;
      setBeeMessages((messages) => [...messages, { ...detail, opacity: 1 }]);
    };
    const moveMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; x: number; y: number; opacity: number }>).detail;
      setBeeMessages((messages) => messages.map((message) => message.id === detail.id ? { ...message, x: detail.x, y: detail.y, opacity: detail.opacity } : message));
    };
    const removeMessage = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      setBeeMessages((messages) => messages.filter((message) => message.id !== id));
    };
    window.addEventListener("bubblebee-click", showMessage);
    window.addEventListener("bubblebee-move", moveMessage);
    window.addEventListener("bubblebee-done", removeMessage);
    return () => {
      window.removeEventListener("bubblebee-click", showMessage);
      window.removeEventListener("bubblebee-move", moveMessage);
      window.removeEventListener("bubblebee-done", removeMessage);
    };
  }, []);
  const [settings, setSettings] = useState<BearSettings>(loadBearSettings);
  const isAdminPage = location.pathname.startsWith("/lucidblocks/admin");
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const icon = existing ?? document.head.appendChild(document.createElement("link"));
    icon.rel = "icon";
    icon.href = location.pathname.startsWith("/lucidblocks") ? "/lucid_blocks.ico" : "/favicon.ico";
  }, [location.pathname]);
  return (
    <>
      {settings.animation && <BubbleBears key={`${settings.count}-${settings.speed}-${settings.hitForce}`} />}
      {beeMessages.map((message) => <div className="bee-message" key={message.id} style={{ left: message.x, top: message.y - 55, opacity: message.opacity }}>{message.text}</div>)}
      <header className="site-header">
        <div className="wrap">
          <Link className="site-title" to="/lucidblocks/mods">
            <img className="site-title-icon" src="/lucid_blocks.ico" alt="" />
            Lucid Blocks Mods
          </Link>
          <nav className="site-nav">
            <Link to="/lucidblocks/mods" className={location.pathname.startsWith("/lucidblocks/mods") ? "active" : ""}>
              Mods
            </Link>
            <Link to="/lucidblocks/ideas" className={location.pathname === "/lucidblocks/ideas" ? "active" : ""}>
              Ideas
            </Link>
            <SettingsPopover settings={settings} onChange={setSettings} />
            {session && <><Link to="/lucidblocks/admin" className={isAdminPage && !location.pathname.endsWith("/submissions") ? "active" : ""}>Admin</Link><Link to="/lucidblocks/admin/submissions" className={location.pathname.endsWith("/submissions") ? "active" : ""}><span className="submissions-tab-label">Submissions{pendingCount > 0 && <span className="pending-count-dot" aria-label={`${pendingCount} pending submissions`} />}</span></Link><button className="btn btn-sm header-logout-btn" onClick={signOut}>Logout</button></>}
          </nav>
        </div>
      </header>
      <main className="wrap">
        <Routes>
          <Route path="mods" element={<Home />} />
          <Route path="mods/:modId" element={<ModDetail />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="login" element={<Login />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/submissions" element={<Submissions />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <span>Lucid Blocks Mods</span>
          <span className="footer-copyright">© putzwirk 2026</span>
          {!session && (
            <Link to="/lucidblocks/login" className="footer-admin-link">
              Admin
            </Link>
          )}
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/lucidblocks/*" element={<LucidLayout />} />
        <Route path="/ideas" element={<Navigate to="/lucidblocks/ideas" replace />} />
        <Route path="/mods" element={<Navigate to="/lucidblocks/mods" replace />} />
        <Route path="/mods/:modId" element={<Navigate to="/lucidblocks/mods" replace />} />
        <Route path="/admin" element={<Navigate to="/lucidblocks/admin" replace />} />
        <Route path="/login" element={<Navigate to="/lucidblocks/login" replace />} />
      </Routes>
    </>
  );
}
