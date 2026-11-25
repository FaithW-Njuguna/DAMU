import { useState } from "react";
import { api } from "../api";
import { BLOOD, Badge, Button, Card, Confirm, DataState, Empty, Field, FilterSelect, FormAlert, GeoCapture, Modal, PageHead, StatusBadge, Table, fmt, fmtDay, useFetch, useToast } from "../ui";

const AV = [["available", "Available"], ["unavailable", "Unavailable"], ["recently_donated", "Recently donated"]];

const REST_DAYS = 56; // keep in step with the 56-day rule on the server

// The day the donor can be matched again, or null when they are free already.
const nextEligible = (last) => {
  if (!last) return null;
  const d = new Date(last);
  d.setDate(d.getDate() + REST_DAYS);
  return d > new Date() ? d : null;
};

const dayText = (d) => d.toLocaleDateString("en-KE", { dateStyle: "medium" });

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
  const [geo, setGeo] = useState({ latitude: null, longitude: null });
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
    try { await api("/donors/profile", { method: "POST", body: { blood_type: f.blood_type, location: f.location.trim(), ...geo } }); done(); }
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
        <GeoCapture value={geo} onChange={setGeo} />
        <Button busy={busy} type="submit">Save profile</Button>
      </form>
    </Card>
  );
}

function Profile({ donor, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const next = nextEligible(donor.last_donation_date);
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
        {next && donor.availability_status === "recently_donated" && <p className="mute" style={{ marginTop: 8 }}>Thank you for donating! You'll be set back to Available automatically on {dayText(next)}, after the 56-day rest.</p>}
        {next && donor.availability_status === "available" && <p className="mute" style={{ marginTop: 8 }}>You donated recently, so you'll be matched to new requests again from {dayText(next)}.</p>}
      </Card>
      <LocationCard donor={donor} reload={reload} />
      <Matches onChanged={reload} />
    </div>
  );
}

function LocationCard({ donor, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [location, setLocation] = useState(donor.location);
  const [geo, setGeo] = useState({
    latitude: donor.latitude == null ? null : Number(donor.latitude),
    longitude: donor.longitude == null ? null : Number(donor.longitude)
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const hasGeo = donor.latitude != null && donor.longitude != null;

  const save = async (e) => {
    e.preventDefault();
    if (location.trim().length < 2) return setErr("Enter your sub-county or area");
    setErr(""); setBusy(true);
    try {
      await api("/donors/location", { method: "PATCH", body: { location: location.trim(), ...geo } });
      toast("Location updated"); setEditing(false); reload();
    } catch (er) { setErr(er.message); }
    setBusy(false);
  };

  return (
    <Card title="Where you can be reached">
      {!editing ? (
        <div className="row between">
          <div>
            <strong>{donor.location}</strong>
            <p className="mute">{hasGeo ? "Exact location shared. You'll be asked about the closest requests first." : "Area name only. Share your exact location to be asked about nearby requests first."}</p>
          </div>
          <Button variant="ghost" className="sm" onClick={() => setEditing(true)}>Update</Button>
        </div>
      ) : (
        <form className="form" onSubmit={save} noValidate>
          <Field label="Location (sub-county)" value={location} error={err} onChange={(e) => setLocation(e.target.value)} />
          <GeoCapture value={geo} onChange={setGeo} />
          <div className="row"><Button busy={busy} type="submit">Save location</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      )}
    </Card>
  );
}

// Where a donation stands once the donor has confirmed they will give blood.
function DonationCell({ r, onReport }) {
  const state = r.unit_logged ? ["ok", "Confirmed by the hospital"]
    : r.requester_confirmed_at ? ["ok", "Confirmed by the requester"]
    : r.donor_reported_at ? ["warn", "Reported, awaiting confirmation"] : null;
  return (
    <div>
      <span className="code">{r.tracking_code}</span>
      <div style={{ marginTop: 6 }}>
        {state
          ? <><Badge tone={state[0]}>{state[1]}</Badge>{r.donation_date && <small className="mute" style={{ display: "block" }}>Donated {fmtDay(r.donation_date)}</small>}</>
          : <Button className="sm" onClick={onReport}>I've donated</Button>}
      </div>
    </div>
  );
}

function DonateDialog({ match, onDone, onCancel }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString("en-CA");
  const earliest = new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const d = await api("/donors/donations", { method: "POST", body: { match_id: match.match_id, donation_date: date } });
      toast(d.message);
      onDone();
    } catch (er) { setErr(er.message); setBusy(false); }
  };

  return (
    <Modal open title="Report your donation" onClose={onCancel}>
      <form onSubmit={submit} noValidate>
        <p className="mute" style={{ margin: "8px 0 14px" }}>Tell us when you gave blood for this {match.blood_type} request. The hospital or the requester will confirm it. You'll rest for 56 days after it is confirmed.</p>
        <Field label="Date you donated" type="date" min={earliest} max={today} value={date} error={err} onChange={(e) => setDate(e.target.value)} />
        <div className="row">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" busy={busy}>Report donation</Button>
        </div>
      </form>
    </Modal>
  );
}

function Matches({ onChanged }) {
  const m = useFetch("/donors/matches");
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [ask, setAsk] = useState(null);
  const [report, setReport] = useState(null);
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
      : r.status === "confirmed" ? <DonationCell r={r} onReport={() => setReport(r)} />
      : r.tracking_code ? <span className="code">{r.tracking_code}</span> : "–" }
  ];
  return (
    <Card title="Match requests">
      <DataState loading={m.loading} error={m.error} onRetry={m.reload}>
        {(m.data?.matches || []).length === 0 ? <Empty title="No requests yet" text="When someone needs your blood type nearby, the request will appear here." /> : <>
          <div style={{ maxWidth: 220, marginBottom: 12 }}><FilterSelect label="Show" value={filter} onChange={setFilter} options={["notified", "confirmed", "declined", "expired", "cancelled"]} /></div>
          {rows.length ? <Table columns={cols} rows={rows} rowKey="match_id" /> : <Empty title="Nothing matches this filter" text="" />}
        </>}
      </DataState>
      <Confirm open={!!ask} busy={busy} title={ask?.response === "confirm" ? "Confirm you can donate?" : "Decline this request?"}
        text={ask?.response === "confirm" ? "The requester will be told a donor has confirmed, and you'll get a tracking code. Please only confirm if you are able to go to the hospital." : "We'll ask the next compatible donor instead."}
        confirmLabel={ask?.response === "confirm" ? "Yes, I'll donate" : "Decline"} onConfirm={answer} onCancel={() => setAsk(null)} />
      {report && <DonateDialog key={report.match_id} match={report} onCancel={() => setReport(null)} onDone={() => { setReport(null); m.reload(); onChanged(); }} />}
    </Card>
  );
}