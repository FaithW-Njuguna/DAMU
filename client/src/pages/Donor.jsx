import { useState } from "react";
import { api } from "../api";
import { BLOOD, Badge, Button, Card, Confirm, DataState, Empty, Field, FilterSelect, FormAlert, PageHead, StatusBadge, Table, fmt, useFetch, useToast } from "../ui";

const AV = [["available", "Available"], ["unavailable", "Unavailable"], ["recently_donated", "Recently donated"]];

export default function Donor() {
  const me = useFetch("/donors/me");
  return (
    <>
      <PageHead title="My donations" sub="Your donor profile, availability and match requests." />
      <DataState loading={me.loading} error={me.error} onRetry={me.reload}>
        {me.data?.donor ? <Profile donor={me.data.donor} reload={me.reload} /> : <CreateProfile done={me.reload} />}
      </DataState>
    </>
  );
}

function CreateProfile({ done }) {
  const [f, setF] = useState({ blood_type: "", location: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!f.blood_type) v.blood_type = "Choose your blood type";
    if (f.location.trim().length < 2) v.location = "Enter your sub-county or area";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try { await api("/donors/profile", { method: "POST", body: { blood_type: f.blood_type, location: f.location.trim() } }); done(); }
    catch (er) { setFormErr(er.message); }
    setBusy(false);
  };
  return (
    <Card title="Set up your donor profile">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert>{formErr}</FormAlert>
        <Field label="Blood type" as="select" value={f.blood_type} error={errs.blood_type} onChange={(e) => setF({ ...f, blood_type: e.target.value })}>
          <option value="">Select…</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}
        </Field>
        <Field label="Location (sub-county)" value={f.location} error={errs.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <Button busy={busy} type="submit">Save profile</Button>
      </form>
    </Card>
  );
}

function Profile({ donor, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const setAv = async (s) => {
    setBusy(true);
    try { await api("/donors/availability", { method: "PATCH", body: { availability_status: s } }); toast("Availability updated"); reload(); }
    catch (e) { toast(e.message, "err"); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <Card title="Donor profile">
        <div className="row"><Badge tone="bad">{donor.blood_type}</Badge><span>{donor.location}</span></div>
        <p className="mute" style={{ marginTop: 12 }}>Your availability</p>
        <div className="seg" role="group" aria-label="Availability">
          {AV.map(([v, l]) => <button key={v} disabled={busy} aria-pressed={donor.availability_status === v} className={`btn ghost sm${donor.availability_status === v ? " on" : ""}`} onClick={() => setAv(v)}>{l}</button>)}
        </div>
        {donor.availability_status !== "available" && <p className="mute" style={{ marginTop: 8 }}>You won't be matched to new requests while you're not available.</p>}
      </Card>
      <Matches />
    </div>
  );
}

function Matches() {
  const m = useFetch("/donors/matches");
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = (m.data?.matches || []).filter((r) => filter === "all" || r.status === filter);
  const answer = async () => {
    setBusy(true);
    try {
      const d = await api(`/requests/${ask.match.match_id}/respond`, { method: "POST", body: { response: ask.response } });
      toast(ask.response === "confirm" ? `Confirmed. Your tracking code is ${d.tracking_code}` : "Response recorded");
      m.reload();
    } catch (e) { toast(e.message, "err"); }
    setBusy(false); setAsk(null);
  };
  const act = (match, response) => setAsk({ match, response });
  const cols = [
    { key: "need", label: "Request", render: (r) => `${r.blood_type}, ${r.units_required} unit${r.units_required > 1 ? "s" : ""}` },
    { key: "urgency", label: "Urgency", render: (r) => <StatusBadge value={r.urgency} /> },
    { key: "where", label: "Where", render: (r) => r.hospital_name || r.location },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
    { key: "created_at", label: "Received", render: (r) => fmt(r.created_at) },
    { key: "act", label: "Action", render: (r) => r.status === "notified"
      ? <span className="row" style={{ gap: 8 }}><Button className="sm" onClick={() => act(r, "confirm")}>I can donate</Button><Button variant="ghost" onClick={() => act(r, "decline")}>Decline</Button></span>
      : r.tracking_code ? <span className="code">{r.tracking_code}</span> : "–" }
  ];
  return (
    <Card title="Match requests">
      <DataState loading={m.loading} error={m.error} onRetry={m.reload}>
        {(m.data?.matches || []).length === 0 ? <Empty title="No requests yet" text="When someone needs your blood type nearby, the request will appear here." /> : <>
          <div style={{ maxWidth: 220, marginBottom: 12 }}><FilterSelect label="Show" value={filter} onChange={setFilter} options={["notified", "confirmed", "declined"]} /></div>
          {rows.length ? <Table columns={cols} rows={rows} rowKey="match_id" /> : <Empty title="Nothing matches this filter" text="" />}
        </>}
      </DataState>
      <Confirm open={!!ask} busy={busy} title={ask?.response === "confirm" ? "Confirm you can donate?" : "Decline this request?"}
        text={ask?.response === "confirm" ? "The requester will be told a donor has confirmed, and you'll get a tracking code. Please only confirm if you are able to go to the hospital." : "We'll ask other donors instead."}
        confirmLabel={ask?.response === "confirm" ? "Yes, I'll donate" : "Decline"} onConfirm={answer} onCancel={() => setAsk(null)} />
    </Card>
  );
}