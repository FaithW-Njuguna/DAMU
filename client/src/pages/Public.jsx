import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, HeartPulse, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { homeFor, useAuth } from "../auth";
import { Badge, Button, Card, Confirm, DataState, Field, FormAlert, PageHead, StatusBadge, fmt, useFetch, useToast } from "../ui";

export function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <div className="stack">
      <section className="hero">
        <h1>Find a blood donor fast. See where every unit goes.</h1>
        <p>DAMU matches urgent requests with compatible donors nearby, then tracks each donated unit from collection to use, in public view.</p>
        <div className="row"><Link className="btn primary" to="/register">Become a donor</Link><Link className="btn ghost" to="/dashboard">See the public dashboard</Link></div>
      </section>
      <div className="grid">
        <Card title="Matching Engine"><HeartPulse color="#b42318" /><p className="mute">Patients and hospitals post a request. Compatible, available donors are notified and can confirm in one tap.</p></Card>
        <Card title="Accountability Chain"><ShieldCheck color="#b42318" /><p className="mute">Every unit gets a tracking code. Units not accounted for within 14 days are flagged for regulators.</p></Card>
        <Card title="Public Dashboard"><BarChart3 color="#b42318" /><p className="mute">Anyone can check the numbers without an account.</p></Card>
      </div>
      <Card><div className="stat">62%</div><p className="mute">of the 550,000 units of blood Kenya needed were collected in 2024/25 (KNBTS). DAMU aims to close that gap by making donating easier and the system easier to trust.</p></Card>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ phone: "", password: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!f.phone.trim()) v.phone = "Enter your phone number";
    if (!f.password) v.password = "Enter your password";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try { const u = await login(f.phone.trim(), f.password); nav(loc.state?.from || homeFor(u.role), { replace: true }); }
    catch (er) { setFormErr(er.message); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <PageHead title="Log in" sub="Use the phone number you registered with." />
      {loc.state?.expired && <div className="alert info" role="status">Your session expired. Log in again to continue.</div>}
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert>{formErr}</FormAlert>
        <Field label="Phone number" type="tel" autoComplete="tel" placeholder="+254712345678" value={f.phone} error={errs.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" value={f.password} error={errs.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button busy={busy} type="submit">Log in</Button>
        <p className="mute">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}

export function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ full_name: "", phone_number: "", email: "", password: "", role: "donor" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.full_name.trim().length < 2) v.full_name = "Enter your full name";
    if (!/^\+?\d{9,14}$/.test(f.phone_number.trim())) v.phone_number = "Enter a valid phone number, e.g. +254712345678";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = "Enter a valid email or leave it empty";
    if (f.password.length < 10) v.password = "Use at least 10 characters";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/auth/register", { method: "POST", body: { ...f, full_name: f.full_name.trim(), phone_number: f.phone_number.trim(), email: f.email || undefined } });
      const u = await login(f.phone_number.trim(), f.password);
      nav(homeFor(u.role), { replace: true });
    } catch (er) { setFormErr(er.message); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <PageHead title="Create your account" sub="Hospital and regulator accounts are created by the DAMU administrator." />
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert>{formErr}</FormAlert>
        <Field label="I am registering as" as="select" value={f.role} onChange={set("role")}>
          <option value="donor">A blood donor</option><option value="patient">A patient or family member</option>
        </Field>
        <Field label="Full name" autoComplete="name" value={f.full_name} error={errs.full_name} onChange={set("full_name")} />
        <Field label="Phone number" type="tel" autoComplete="tel" placeholder="+254712345678" hint="Match alerts are sent to this number." value={f.phone_number} error={errs.phone_number} onChange={set("phone_number")} />
        <Field label="Email (optional)" type="email" autoComplete="email" value={f.email} error={errs.email} onChange={set("email")} />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." value={f.password} error={errs.password} onChange={set("password")} />
        <Button busy={busy} type="submit">Create account</Button>
        <p className="mute">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}

export function Track() {
  const [code, setCode] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return setErr("Enter your tracking code");
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await api(`/units/tracking/${encodeURIComponent(code.trim())}`)); }
    catch (er) { setErr(er.status === 404 ? "No unit found for that code. If you only just confirmed, the hospital may not have logged your donation yet." : er.message); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <PageHead title="Track a donated unit" sub="Enter the tracking code you received when you confirmed your donation." />
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Tracking code" placeholder="DAMU-XXXXXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button busy={busy} type="submit">Check status</Button>
      </form>
      <FormAlert>{err}</FormAlert>
      {res && <Card title="Unit status"><div className="row"><StatusBadge value={res.status} /><span className="mute">Collected {fmt(res.collection_date)}</span></div><p className="mute" style={{ marginTop: 8 }}>The recipient's identity is never shown.</p></Card>}
    </div>
  );
}

export function Dashboard() {
  const d = useFetch("/dashboard");
  const total = d.data?.total_units || 0;
  return (
    <div className="stack">
      <PageHead title="Public dashboard" sub="Live totals from the DAMU platform. No login needed." />
      <DataState loading={d.loading} error={d.error} onRetry={d.reload}>
        {d.data && <>
          <div className="grid">
            {[["Registered donors", d.data.total_donors], ["Blood requests", d.data.total_requests], ["Units tracked", d.data.total_units]].map(([l, n]) => <Card key={l}><div className="stat">{n}</div><p className="mute">{l}</p></Card>)}
          </div>
          <Card title="Where tracked units stand">
            {d.data.unit_statuses.length === 0 ? <p className="mute">No units have been logged yet.</p> :
              d.data.unit_statuses.map((s) => (
                <div key={s.status} style={{ marginBottom: 12 }}><div className="row between"><StatusBadge value={s.status} /><span>{s.total}</span></div><div className="bar"><i style={{ width: `${(s.total / total) * 100}%` }} /></div></div>
              ))}
          </Card>
          <p className="mute">Stock by hospital, trust scores and contradiction alerts will appear here once the server provides that data.</p>
        </>}
      </DataState>
    </div>
  );
}

export function Report() {
  const toast = useToast();
  const hosp = useFetch("/hospitals");
  const [text, setText] = useState("");
  const [hospital, setHospital] = useState("");
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const review = (e) => { e.preventDefault(); text.trim().length < 20 ? setErr("Describe the concern in at least 20 characters") : (setErr(""), setAsk(true)); };
  const send = async () => {
    setBusy(true);
    try { await api("/reports/whistleblower", { method: "POST", anon: true, body: { report_text: text, hospital_id: hospital || undefined } }); toast("Report sent. Thank you."); setText(""); setHospital(""); }
    catch (er) { toast(er.message, "err"); }
    setBusy(false); setAsk(false);
  };
  return (
    <div className="stack">
      <PageHead title="Report a concern" sub="For health workers and others who see blood being mishandled." />
      <div className="alert info" role="note">This form does not send your login or personal details. Only the text below and the hospital you pick are stored.</div>
      <form className="form" onSubmit={review} noValidate>
        <Field label="Hospital (optional)" as="select" value={hospital} onChange={(e) => setHospital(e.target.value)}>
          <option value="">Not sure / not listed</option>{(hosp.data?.hospitals || []).map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
        </Field>
        <Field label="What did you see?" as="textarea" value={text} error={err} onChange={(e) => setText(e.target.value)} hint="Include dates, unit codes or places if you can." />
        <Button type="submit">Review and send</Button>
      </form>
      <Confirm open={ask} busy={busy} title="Send this report?" text="Reports are anonymous and cannot be edited or withdrawn after sending." confirmLabel="Send report" onConfirm={send} onCancel={() => setAsk(false)} />
    </div>
  );
}