import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, Confirm, DataState, Empty, Field, FilterSelect, FormAlert, Modal, NoteDialog, PageHead, Table, fmt, useFetch, useToast } from "../ui";

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => chars[n % chars.length]).join("");
};

// The server standardises the number; this only catches obvious typing mistakes.
const validPhone = (value) => /^\+?\d{9,15}$/.test(value.replace(/[\s\-()]/g, ""));

const AUDIT_LABEL = {
  hospital_registered: "Registered a hospital",
  hospital_verified: "Verified a hospital",
  hospital_unverified: "Suspended a hospital",
  account_created: "Created an account",
  account_enabled: "Enabled an account",
  account_disabled: "Disabled an account",
  password_reset: "Reset a password"
};

export default function Admin() {
  const [tab, setTab] = useState("hospitals");
  const hospitals = useFetch("/admin/hospitals");
  const users = useFetch("/admin/users");
  const audit = useFetch("/admin/audit");
  const refresh = () => { hospitals.reload(); users.reload(); audit.reload(); };
  return (
    <div className="stack">
      <PageHead title="Administration" sub="Register and verify hospitals, manage staff accounts, and review what has been changed." />
      <div className="seg" role="tablist">
        {[["hospitals", "Hospitals"], ["accounts", "Staff accounts"], ["activity", "Activity log"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ghost sm${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "hospitals" && <Hospitals state={hospitals} onChange={refresh} />}
      {tab === "accounts" && <Accounts users={users} hospitals={hospitals} onChange={refresh} />}
      {tab === "activity" && <Activity state={audit} />}
    </div>
  );
}

function Hospitals({ state, onChange }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", location: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState("");
  const [decide, setDecide] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 3) v.name = "Enter the hospital's full name";
    if (f.location.trim().length < 2) v.location = "Enter the town or county";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy("new");
    try { await api("/admin/hospitals", { method: "POST", body: f }); toast("Hospital registered. Verify it once you have checked its licence."); setF({ name: "", location: "" }); onChange(); }
    catch (er) { setFormErr(er.message); }
    setBusy("");
  };

  const verify = async (notes) => {
    setBusy("v");
    try {
      await api(`/admin/hospitals/${decide.hospital_id}/verify`, { method: "PATCH", body: { verified: !decide.verified, notes } });
      toast(decide.verified ? "Hospital suspended" : "Hospital verified");
      onChange();
    } catch (er) { toast(er.message, "err"); }
    setBusy(""); setDecide(null);
  };

  const cols = [
    { key: "name", label: "Hospital" },
    { key: "location", label: "Location" },
    { key: "verified", label: "Status", render: (h) => (
      <div>
        <Badge tone={h.verified ? "ok" : "warn"}>{h.verified ? "Verified" : "Awaiting verification"}</Badge>
        {h.verified && h.verified_at && <small className="mute" style={{ display: "block" }}>{fmt(h.verified_at)}</small>}
      </div>) },
    { key: "staff_count", label: "Active staff" },
    { key: "act", label: "Action", render: (h) => <Button variant={h.verified ? "ghost" : "primary"} className="sm" onClick={() => setDecide(h)}>{h.verified ? "Suspend" : "Verify"}</Button> }
  ];

  return (
    <>
      <Card title="Register a hospital">
        <form className="form wide" onSubmit={submit} noValidate>
          <div className="full"><FormAlert>{formErr}</FormAlert></div>
          <Field label="Hospital name" value={f.name} error={errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Field label="Location" placeholder="Town or county" value={f.location} error={errs.location} onChange={(e) => setF({ ...f, location: e.target.value })}
            hint="New hospitals start unverified. Staff can sign in, but cannot record units until you verify the hospital." />
          <div className="full"><Button busy={busy === "new"} type="submit">Register hospital</Button></div>
        </form>
      </Card>
      <Card title="Registered hospitals">
        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {(state.data?.hospitals || []).length ? <Table columns={cols} rows={state.data.hospitals} rowKey="hospital_id" /> : <Empty title="No hospitals yet" text="Register a hospital above, then create its staff accounts." />}
        </DataState>
      </Card>
      <NoteDialog open={!!decide} busy={busy === "v"}
        title={decide?.verified ? `Suspend ${decide?.name}?` : `Verify ${decide?.name}?`}
        text={decide?.verified
          ? "Staff will be unable to log collections or update units, and patients cannot send requests to this hospital, until you verify it again. Units already logged stay tracked."
          : "Confirm you have checked the facility's licence. Record the reference (for example the KMHFL code or licence number) so the check can be audited."}
        label={decide?.verified ? "Reason for suspending" : "Licence or registry reference"}
        confirmLabel={decide?.verified ? "Suspend hospital" : "Verify hospital"}
        onSubmit={verify} onCancel={() => setDecide(null)} />
    </>
  );
}

function ResetDialog({ user, onDone, onCancel }) {
  const toast = useToast();
  const [pw] = useState(genPassword);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(pw); toast("Password copied"); }
    catch { toast("Could not copy. Select the password and copy it by hand.", "err"); }
  };
  const reset = async () => {
    setBusy(true);
    try { await api(`/admin/users/${user.user_id}/reset-password`, { method: "POST", body: { password: pw } }); toast("Password reset. Share it privately."); onDone(); }
    catch (e) { toast(e.message, "err"); setBusy(false); }
  };

  return (
    <Modal open title={`Reset password for ${user.full_name}`} onClose={onCancel}>
      <p className="mute" style={{ marginTop: 8 }}>Give this temporary password to them privately, by phone or in person. They must replace it the next time they sign in.</p>
      <div className="code" style={{ margin: "14px 0", padding: 12, wordBreak: "break-all" }}>{pw}</div>
      <div className="row">
        <Button variant="ghost" onClick={copy}><Copy size={16} />Copy</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button busy={busy} onClick={reset}>Reset password</Button>
      </div>
    </Modal>
  );
}

function Accounts({ users, hospitals, onChange }) {
  const toast = useToast();
  const { user: me } = useAuth();
  const blank = { role: "hospital", full_name: "", phone_number: "", email: "", password: "", hospital_id: "" };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [resetFor, setResetFor] = useState(null);
  const [disable, setDisable] = useState(null);
  const [toggling, setToggling] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.full_name.trim().length < 2) v.full_name = "Enter the person's full name";
    if (!validPhone(f.phone_number)) v.phone_number = "Enter a valid phone number, e.g. +254712345678";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = "Enter a valid email or leave it empty";
    if (f.password.length < 10) v.password = "Use at least 10 characters";
    if (f.role === "hospital" && !f.hospital_id) v.hospital_id = "Choose the hospital";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/admin/users", { method: "POST", body: { ...f, phone_number: f.phone_number.trim(), email: f.email || undefined, hospital_id: f.role === "hospital" ? f.hospital_id : undefined } });
      toast("Account created. Share the temporary password privately."); setF({ ...blank, role: f.role }); onChange();
    } catch (er) { setFormErr(er.message); }
    setBusy(false);
  };

  const setActive = async (u, active) => {
    setToggling(true);
    try { await api(`/admin/users/${u.user_id}/active`, { method: "PATCH", body: { active } }); toast(active ? "Account enabled" : "Account disabled"); onChange(); }
    catch (er) { toast(er.message, "err"); }
    setToggling(false); setDisable(null);
  };

  const rows = (users.data?.users || []).filter((u) => filter === "all" || u.role === filter);
  const cols = [
    { key: "full_name", label: "Name" },
    { key: "role", label: "Role", render: (u) => <Badge tone={u.role === "admin" ? "bad" : u.role === "regulator" ? "info" : "neutral"}>{u.role}</Badge> },
    { key: "hospital_name", label: "Hospital", render: (u) => u.hospital_name || "–" },
    { key: "phone_number", label: "Phone" },
    { key: "is_active", label: "Status", render: (u) => (
      <div>
        <Badge tone={u.is_active ? "ok" : "bad"}>{u.is_active ? "Active" : "Disabled"}</Badge>
        {u.must_change_password && <small className="mute" style={{ display: "block" }}>Temporary password</small>}
      </div>) },
    { key: "act", label: "Action", render: (u) => u.user_id === me.user_id ? "–" : (
      <span className="row" style={{ gap: 8 }}>
        {u.is_active
          ? <Button variant="ghost" className="sm" onClick={() => setDisable(u)}>Disable</Button>
          : <Button className="sm" busy={toggling} onClick={() => setActive(u, true)}>Enable</Button>}
        <Button variant="ghost" className="sm" onClick={() => setResetFor(u)}>Reset password</Button>
      </span>) }
  ];

  return (
    <>
      <Card title="Create a staff account">
        <form className="form wide" onSubmit={submit} noValidate>
          <div className="full"><FormAlert>{formErr}</FormAlert></div>
          <Field label="Account type" as="select" value={f.role} onChange={set("role")}><option value="hospital">Hospital staff</option><option value="regulator">Regulator (KNBTS / KTTA)</option></Field>
          {f.role === "hospital" && (
            <Field label="Hospital" as="select" value={f.hospital_id} error={errs.hospital_id} onChange={set("hospital_id")} hint={hospitals.data?.hospitals?.length ? undefined : "Register a hospital first."}>
              <option value="">Select…</option>
              {(hospitals.data?.hospitals || []).map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}{h.verified ? "" : " (awaiting verification)"}</option>)}
            </Field>
          )}
          <Field label="Full name" value={f.full_name} error={errs.full_name} onChange={set("full_name")} />
          <Field label="Phone number (used to log in)" type="tel" placeholder="+254712345678" value={f.phone_number} error={errs.phone_number} onChange={set("phone_number")} hint="0712345678 and +254712345678 are treated as the same number." />
          <Field label="Email (optional)" type="email" value={f.email} error={errs.email} onChange={set("email")} />
          <Field label="Temporary password" value={f.password} error={errs.password} onChange={set("password")} hint="At least 10 characters. They must change it at first sign-in." />
          <div className="full row">
            <Button busy={busy} type="submit">Create account</Button>
            <Button variant="ghost" type="button" onClick={() => setF({ ...f, password: genPassword() })}><KeyRound size={16} />Generate password</Button>
          </div>
        </form>
      </Card>
      <Card title="Hospital, regulator and admin accounts">
        <DataState loading={users.loading} error={users.error} onRetry={users.reload}>
          {(users.data?.users || []).length === 0 ? <Empty title="No staff accounts yet" text="Accounts you create will be listed here." /> : <>
            <div style={{ maxWidth: 220, marginBottom: 12 }}><FilterSelect label="Role" value={filter} onChange={setFilter} options={["hospital", "regulator", "admin"]} /></div>
            {rows.length ? <Table columns={cols} rows={rows} rowKey="user_id" /> : <Empty title="Nothing matches this filter" text="" />}
          </>}
        </DataState>
      </Card>
      {resetFor && <ResetDialog key={resetFor.user_id} user={resetFor} onCancel={() => setResetFor(null)} onDone={() => { setResetFor(null); onChange(); }} />}
      <Confirm open={!!disable} busy={toggling} title={`Disable ${disable?.full_name}?`}
        text="They are signed out straight away and cannot log in until you enable the account again. Their past activity stays on record."
        confirmLabel="Disable account" onConfirm={() => setActive(disable, false)} onCancel={() => setDisable(null)} />
    </>
  );
}

function Activity({ state }) {
  const cols = [
    { key: "created_at", label: "When", render: (a) => fmt(a.created_at) },
    { key: "admin_name", label: "Admin", render: (a) => a.admin_name || "System" },
    { key: "action", label: "Action", render: (a) => AUDIT_LABEL[a.action] || a.action },
    { key: "details", label: "Details", render: (a) => <div style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{a.details?.notes || a.details?.name || (a.details?.role ? `Role: ${a.details.role}` : "–")}</div> }
  ];
  return (
    <Card title="Recent administrative actions">
      <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
        {(state.data?.entries || []).length ? <Table columns={cols} rows={state.data.entries} rowKey="audit_id" /> : <Empty title="No activity yet" text="Hospital, account and password changes will be listed here." />}
      </DataState>
    </Card>
  );
}