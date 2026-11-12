import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../api";
import { Badge, Button, Card, DataState, Empty, Field, FilterSelect, FormAlert, PageHead, Table, fmt, useFetch, useToast } from "../ui";

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => chars[n % chars.length]).join("");
};

export default function Admin() {
  const [tab, setTab] = useState("hospitals");
  const hospitals = useFetch("/admin/hospitals");
  const users = useFetch("/admin/users");
  const refresh = () => { hospitals.reload(); users.reload(); };
  return (
    <div className="stack">
      <PageHead title="Administration" sub="Register hospitals and create the hospital and regulator accounts, which cannot self-register." />
      <div className="seg" role="tablist">
        {[["hospitals", "Hospitals"], ["accounts", "Staff accounts"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ghost sm${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "hospitals" ? <Hospitals state={hospitals} onChange={refresh} /> : <Accounts users={users} hospitals={hospitals} onChange={refresh} />}
    </div>
  );
}

function Hospitals({ state, onChange }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", location: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 3) v.name = "Enter the hospital's full name";
    if (f.location.trim().length < 2) v.location = "Enter the town or county";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy("new");
    try { await api("/admin/hospitals", { method: "POST", body: f }); toast("Hospital registered"); setF({ name: "", location: "" }); onChange(); }
    catch (er) { setFormErr(er.message); }
    setBusy("");
  };
  const verify = async (h) => {
    setBusy(h.hospital_id);
    try { await api(`/admin/hospitals/${h.hospital_id}/verify`, { method: "PATCH", body: { verified: !h.verified } }); toast(h.verified ? "Hospital unverified" : "Hospital verified"); onChange(); }
    catch (er) { toast(er.message, "err"); }
    setBusy("");
  };
  const cols = [
    { key: "name", label: "Hospital" },
    { key: "location", label: "Location" },
    { key: "verified", label: "Status", render: (h) => <Badge tone={h.verified ? "ok" : "warn"}>{h.verified ? "Verified" : "Unverified"}</Badge> },
    { key: "staff_count", label: "Staff accounts" },
    { key: "act", label: "Action", render: (h) => <Button variant="ghost" className="sm" busy={busy === h.hospital_id} onClick={() => verify(h)}>{h.verified ? "Unverify" : "Verify"}</Button> }
  ];
  return (
    <>
      <Card title="Register a hospital">
        <form className="form wide" onSubmit={submit} noValidate>
          <div className="full"><FormAlert>{formErr}</FormAlert></div>
          <Field label="Hospital name" value={f.name} error={errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Field label="Location" placeholder="Town or county" value={f.location} error={errs.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <div className="full"><Button busy={busy === "new"} type="submit">Register hospital</Button></div>
        </form>
      </Card>
      <Card title="Registered hospitals">
        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {(state.data?.hospitals || []).length ? <Table columns={cols} rows={state.data.hospitals} rowKey="hospital_id" /> : <Empty title="No hospitals yet" text="Register a hospital above, then create its staff accounts." />}
        </DataState>
      </Card>
    </>
  );
}

function Accounts({ users, hospitals, onChange }) {
  const toast = useToast();
  const blank = { role: "hospital", full_name: "", phone_number: "", email: "", password: "", hospital_id: "" };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.full_name.trim().length < 2) v.full_name = "Enter the person's full name";
    if (!/^\+?\d{9,14}$/.test(f.phone_number.trim())) v.phone_number = "Enter a valid phone number, e.g. +254712345678";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = "Enter a valid email or leave it empty";
    if (f.password.length < 10) v.password = "Use at least 10 characters";
    if (f.role === "hospital" && !f.hospital_id) v.hospital_id = "Choose the hospital";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/admin/users", { method: "POST", body: { ...f, phone_number: f.phone_number.trim(), email: f.email || undefined, hospital_id: f.role === "hospital" ? f.hospital_id : undefined } });
      toast("Account created. Share the password privately."); setF({ ...blank, role: f.role }); onChange();
    } catch (er) { setFormErr(er.message); }
    setBusy(false);
  };
  const rows = (users.data?.users || []).filter((u) => filter === "all" || u.role === filter);
  const cols = [
    { key: "full_name", label: "Name" },
    { key: "role", label: "Role", render: (u) => <Badge tone={u.role === "admin" ? "bad" : u.role === "regulator" ? "info" : "neutral"}>{u.role}</Badge> },
    { key: "hospital_name", label: "Hospital", render: (u) => u.hospital_name || "–" },
    { key: "phone_number", label: "Phone" },
    { key: "created_at", label: "Created", render: (u) => fmt(u.created_at) }
  ];
  return (
    <>
      <Card title="Create a staff account">
        <form className="form wide" onSubmit={submit} noValidate>
          <div className="full"><FormAlert>{formErr}</FormAlert></div>
          <Field label="Account type" as="select" value={f.role} onChange={set("role")}><option value="hospital">Hospital staff</option><option value="regulator">Regulator (KNBTS / KTTA)</option></Field>
          {f.role === "hospital" && (
            <Field label="Hospital" as="select" value={f.hospital_id} error={errs.hospital_id} onChange={set("hospital_id")} hint={hospitals.data?.hospitals?.length ? undefined : "Register a hospital first."}>
              <option value="">Select…</option>{(hospitals.data?.hospitals || []).map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
            </Field>
          )}
          <Field label="Full name" value={f.full_name} error={errs.full_name} onChange={set("full_name")} />
          <Field label="Phone number (used to log in)" type="tel" placeholder="+254712345678" value={f.phone_number} error={errs.phone_number} onChange={set("phone_number")} />
          <Field label="Email (optional)" type="email" value={f.email} error={errs.email} onChange={set("email")} />
          <Field label="Temporary password" value={f.password} error={errs.password} onChange={set("password")} hint="At least 10 characters. Share it privately." />
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
    </>
  );
}