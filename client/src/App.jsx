import { Navigate, NavLink, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Building2, ClipboardList, Droplet, HeartPulse, Home, LayoutDashboard, LogOut, Search, ShieldAlert, Siren } from "lucide-react";
import { homeFor, useAuth } from "./auth";
import { Landing, Login, Register, Track, Dashboard, Report } from "./pages/Public";
import Donor from "./pages/Donor";
import Requests from "./pages/Requests";
import Hospital from "./pages/Hospital";
import Regulator from "./pages/Regulator";

const ROLE_NAV = {
  donor: [["/donor", "My donations", HeartPulse]],
  patient: [["/requests", "Blood requests", ClipboardList]],
  hospital: [["/hospital", "Unit tracking", Building2], ["/requests", "Blood requests", ClipboardList]],
  regulator: [["/regulator", "Review queue", ShieldAlert]]
};
ROLE_NAV.admin = ROLE_NAV.regulator;
const PUBLIC_NAV = [["/dashboard", "Dashboard", LayoutDashboard], ["/track", "Track a unit", Search], ["/report", "Report a concern", Siren]];

const Logo = () => <Link to="/" className="logo"><Droplet size={24} fill="currentColor" />DAMU</Link>;
const Links = ({ items }) => items.map(([to, label, Icon]) => <NavLink key={to} to={to} className="nl"><Icon size={18} />{label}</NavLink>);

function Layout() {
  const { user, logout } = useAuth();
  const own = user ? ROLE_NAV[user.role] || [] : [];
  const tabs = user ? [...own, ...PUBLIC_NAV] : [["/", "Home", Home], ...PUBLIC_NAV];
  return (
    <div className={`app${user ? " authed" : ""}`}>
      <aside className="side" aria-label="Main navigation">
        <Logo /><Links items={own} /><Links items={PUBLIC_NAV} /><div className="sp" />
        <div className="me">{user?.full_name}<br />{user?.role}</div>
        <button className="nl" onClick={logout}><LogOut size={18} />Log out</button>
      </aside>
      <div>
        <header className="top">
          <Logo />
          <nav className="tl" aria-label="Public pages">{!user && <Links items={PUBLIC_NAV} />}</nav>
          {user ? <button className="btn ghost sm" onClick={logout}><LogOut size={16} />Log out</button>
            : <div className="row" style={{ gap: 8 }}><Link className="btn ghost sm" to="/login">Log in</Link><Link className="btn primary sm" to="/register">Register</Link></div>}
        </header>
        <main className="main">
          <Outlet />
          <p className="foot">DAMU helps match donors with patients and tracks donated units. It does not replace a hospital's own blood-safety screening and testing, which must be done before any transfusion.</p>
        </main>
      </div>
      <nav className="tabbar" aria-label="Quick navigation">
        {tabs.slice(0, 5).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon size={20} />{label}</NavLink>)}
      </nav>
    </div>
  );
}

function Guard({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  const g = (roles, el) => <Guard roles={roles}>{el}</Guard>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/track" element={<Track />} />
        <Route path="/report" element={<Report />} />
        <Route path="/donor" element={g(["donor"], <Donor />)} />
        <Route path="/requests" element={g(["patient", "hospital"], <Requests />)} />
        <Route path="/hospital" element={g(["hospital"], <Hospital />)} />
        <Route path="/regulator" element={g(["regulator", "admin"], <Regulator />)} />
        <Route path="*" element={<div className="card"><h3>Page not found</h3><p className="mute">That page doesn't exist. <Link to="/">Go home</Link></p></div>} />
      </Route>
    </Routes>
  );
}