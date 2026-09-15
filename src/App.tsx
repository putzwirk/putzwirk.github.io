import { Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import NotificationBell from "./components/NotificationBell";
import AuthMenu from "./components/AuthMenu";
import SettingsPopover, { BearSettings } from "./components/SettingsPopover";
import { loadBearSettings } from "./lib/bearSettings";
import { useAuth } from "./context/AuthContext";
import { isSignedInSession } from "./lib/session";

const Home = lazy(() => import("./pages/Home"));
const ModDetail = lazy(() => import("./pages/ModDetail"));
const Ideas = lazy(() => import("./pages/Ideas"));
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const Submissions = lazy(() => import("./pages/Submissions"));
const Landing = lazy(() => import("./pages/Landing"));
const IssueDetail = lazy(() => import("./pages/IssueDetail"));
const Notifications = lazy(() => import("./pages/Notifications"));
const MyReports = lazy(() => import("./pages/MyReports"));
const BubbleBears = lazy(() => import("./components/BubbleBears"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = pathname.startsWith("/lucidblocks") ? "Lucid Blocks Mods" : "Putzwirk's page";
  }, [pathname]);
  return null;
}

function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={`/lucidblocks${location.pathname}${location.search}${location.hash}`} replace />;
}

function LucidLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isStaff } = useAuth();
  const signedIn = isSignedInSession(session);
  const [settings, setSettings] = useState<BearSettings>(loadBearSettings);
  const isAdmin = location.pathname.startsWith("/lucidblocks/admin");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;
      if (event.key.toLowerCase() !== "a") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      navigate(isStaff ? "/lucidblocks/admin" : "/lucidblocks/login");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStaff, navigate]);
  return (
    <>
      {settings.animation && (
        <Suspense fallback={null}>
          <BubbleBears key={`${settings.count}-${settings.speed}-${settings.hitForce}`} dim={settings.dim} />
        </Suspense>
      )}
      <header className={`site-header${isAdmin ? " site-header-admin" : ""}`}>
        <div className="wrap">
          <Link className="site-title" to="/lucidblocks/mods">
            <img className="site-title-icon" src="/lucid_blocks-64.png" alt="" width={26} height={26} />
            <span className="site-title-text">Lucid Blocks Mods</span>
          </Link>
          <nav className={`site-nav${signedIn ? "" : " site-nav-guest"}`}>
            <Link to="/lucidblocks/mods" className={location.pathname.startsWith("/lucidblocks/mods") ? "active" : ""}>
              Mods
            </Link>
            <Link to="/lucidblocks/ideas" className={location.pathname === "/lucidblocks/ideas" ? "active" : ""}>
              Ideas
            </Link>
            <SettingsPopover settings={settings} onChange={setSettings} />
            <AuthMenu />
            <NotificationBell />
          </nav>
        </div>
      </header>
      <main className="wrap">
        <Suspense fallback={null}>
          <Routes>
            <Route path="mods" element={<Home />} />
            <Route path="mods/:modId" element={<ModDetail />} />
            <Route path="issues/:issueId" element={<IssueDetail />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="my" element={<MyReports />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="login" element={<Login />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/submissions" element={<Submissions />} />
            <Route path="admin/comments" element={<Admin commentsOnly />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="wrap footer-bar">
          <span className="footer-note">Game art <span className="copyright-mark">©</span> Lucy B. Locks · unofficial fan site</span>
          <span className="footer-links">
            <a className="footer-link-desktop" href="https://store.steampowered.com/app/3495730/Lucid_Blocks/" target="_blank" rel="noreferrer">Game on steam</a>
            <a className="footer-link-desktop" href="https://lucidblocks.com/modding.html" target="_blank" rel="noreferrer">Modding guide</a>
            <a href="https://discord.gg/lucidblocks" target="_blank" rel="noreferrer">Discord group</a>
          </span>
          <span className="footer-credit">
            <span className="footer-copyright"><span className="copyright-mark">©</span> putzwirk 2026</span>
            <a
              className="kofi-tip"
              href="https://ko-fi.com/putzwirk/tip"
              target="_blank"
              rel="noreferrer"
              aria-label="Feed the bubblabear — tip on Ko-fi"
              aria-describedby="kofi-tip-hint"
            >
              <img className="kofi-bear kofi-bear-sad" src="/sad_bubblebear.png" alt="" />
              <img className="kofi-bear kofi-bear-happy" src="/happy_bubblebear.png" alt="" />
              <span className="kofi-tooltip" id="kofi-tip-hint" role="tooltip">
                Feed the bubblabear
                <svg className="kofi-face" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
                  <circle cx="3" cy="4" r="1.9" fill="currentColor" />
                  <circle cx="21" cy="4" r="1.9" fill="currentColor" />
                  <path d="M8 10.5h8M12 10.5V6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
              </span>
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/lucidblocks/*" element={<LucidLayout />} />
        <Route path="/*" element={<LegacyRedirect />} />
      </Routes>
    </Suspense>
  );
}
