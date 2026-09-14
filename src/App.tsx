import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import NotificationBell from "./components/NotificationBell";
import AuthMenu from "./components/AuthMenu";
import SettingsPopover, { BearSettings } from "./components/SettingsPopover";
import { loadBearSettings } from "./lib/bearSettings";
import { useAuth } from "./context/AuthContext";
import { fetchPendingCommentCount } from "./lib/data";
import { supabase } from "./lib/supabase";

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

async function fetchPendingIssueCount(): Promise<number> {
  const { count, error } = await supabase
    .from("issues")
    .select("*", { count: "exact", head: true })
    .eq("moderation_status", "pending")
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

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
  const { session, isStaff, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingCommentCount, setPendingCommentCount] = useState(0);
  useEffect(() => {
    if (!isStaff) { setPendingCount(0); setPendingCommentCount(0); return; }
    const refreshPendingCounts = () => {
      fetchPendingIssueCount().then(setPendingCount).catch(() => undefined);
      fetchPendingCommentCount().then(setPendingCommentCount).catch(() => undefined);
    };
    refreshPendingCounts();
    const timer = window.setInterval(refreshPendingCounts, 60000);
    return () => window.clearInterval(timer);
  }, [isStaff]);
  const [settings, setSettings] = useState<BearSettings>(loadBearSettings);
  const isAdmin = location.pathname.startsWith("/lucidblocks/admin");
  return (
    <>
      {settings.animation && (
        <Suspense fallback={null}>
          <BubbleBears key={`${settings.count}-${settings.speed}-${settings.hitForce}`} />
        </Suspense>
      )}
      <header className={`site-header${isAdmin ? " site-header-admin" : ""}`}>
        <div className="wrap">
          <Link className="site-title" to="/lucidblocks/mods">
            <img className="site-title-icon" src="/lucid_blocks-64.png" alt="" width={26} height={26} />
            <span className="site-title-text">Lucid Blocks Mods</span>
          </Link>
          <nav className={`site-nav${session ? "" : " site-nav-guest"}`}>
            <Link to="/lucidblocks/mods" className={location.pathname.startsWith("/lucidblocks/mods") ? "active" : ""}>
              Mods
            </Link>
            <Link to="/lucidblocks/ideas" className={location.pathname === "/lucidblocks/ideas" ? "active" : ""}>
              Ideas
            </Link>
            <SettingsPopover settings={settings} onChange={setSettings} />
            <AuthMenu />
            <NotificationBell />
            {isStaff && (
              <>
                <span className="site-nav-separator" aria-hidden="true" />
                <Link to="/lucidblocks/admin" className={isAdmin && !location.pathname.endsWith("/submissions") && !location.pathname.endsWith("/comments") ? "active" : ""}>Admin</Link>
                <Link to="/lucidblocks/admin/submissions" className={location.pathname.endsWith("/submissions") ? "active" : ""}>
                  <span className="submissions-tab-label">Submissions{pendingCount > 0 && <span className="pending-count-dot" aria-label={`${pendingCount} pending submissions`} />}</span>
                </Link>
                <Link to="/lucidblocks/admin/comments" className={location.pathname.endsWith("/comments") ? "active" : ""}>
                  <span className="submissions-tab-label">Comments{pendingCommentCount > 0 && <span className="pending-count-dot" aria-label={`${pendingCommentCount} pending comments`} />}</span>
                </Link>
                <button className="btn btn-sm header-logout-btn" onClick={signOut} title="Logout" aria-label="Logout">[➜]</button>
              </>
            )}
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
          <span className="footer-brand">Lucid Blocks Mods</span>
          <span className="footer-note">Game art <span className="copyright-mark">©</span> Lucy B. Locks · unofficial fan site</span>
          <span className="footer-links">
            <a href="https://store.steampowered.com/app/3495730/Lucid_Blocks/" target="_blank" rel="noreferrer">Steam ↗</a>
            <a href="https://lucidblocks.com/modding.html" target="_blank" rel="noreferrer">Modding guide ↗</a>
            <a href="https://discord.gg/lucidblocks" target="_blank" rel="noreferrer">Discord ↗</a>
          </span>
          <span className="footer-copyright"><span className="copyright-mark">©</span> putzwirk 2026</span>
          {!isStaff && (
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
