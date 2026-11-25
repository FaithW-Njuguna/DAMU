import { useState } from "react";
import { api } from "../api";
import { BLOOD, Badge, Button, Card, DataState, Empty, Field, FormAlert, Table, fmt, useFetch, useToast } from "../ui";

const AUDIENCE = { donors: "Matching donors", public: "The public", both: "Donors and public" };

export default function HospitalAlerts() {
  const list = useFetch("/alerts/mine");
  const toast = useToast();
  const [f, setF] = useState({ blood_type: "", severity: "low", audience: "both", message: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const send = async (e) => {
    e.preventDefault();
    const v = {};
    if (!f.blood_type) v.blood_type = "Choose the blood group you are short of";
    if (f.message.length > 200) v.message = "Keep it under 200 characters";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy("send");
    try {
      const d = await api("/alerts", { method: "POST", body: { ...f, message: f.message.trim() || undefined } });
      toast(d.donors_notified ? `Alert sent to ${d.donors_notified} matching donor${d.donors_notified > 1 ? "s" : ""}` : "Alert sent");
      setF({ ...f, blood_type: "", message: "" });
      list.reload();
    } catch (er) { setFormErr(er.message); }
    setBusy("");
  };

  const resolve = async (a) => {
    setBusy(a.alert_id);
    try { await api(`/alerts/${a.alert_id}/resolve`, { method: "PATCH" }); toast("Alert resolved"); list.reload(); }
    catch (er) { toast(er.message, "err"); }
    setBusy("");
  };

  const cols = [
    { key: "blood_type", label: "Blood group", render: (a) => <Badge tone="bad">{a.blood_type}</Badge> },
    { key: "severity", label: "Urgency", render: (a) => <Badge tone={a.severity === "critical" ? "bad" : "warn"}>{a.severity === "critical" ? "Critical" : "Running low"}</Badge> },
    { key: "audience", label: "Sent to", render: (a) => AUDIENCE[a.audience] },
    { key: "donors_notified", label: "Donors reached" },
    { key: "created_at", label: "Sent", render: (a) => fmt(a.created_at) },
    { key: "status", label: "Status", render: (a) => a.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Ended</Badge> },
    { key: "act", label: "Action", render: (a) => a.is_active ? <Button variant="ghost" className="sm" busy={busy === a.alert_id} onClick={() => resolve(a)}>Resolve</Button> : "–" }
  ];

  return (
    <Card title="Blood shortage alerts">
      <form className="form wide" onSubmit={send} noValidate>
        <div className="full"><FormAlert>{formErr}</FormAlert></div>
        <Field label="Blood group needed" as="select" value={f.blood_type} error={errs.blood_type} onChange={set("blood_type")}>
          <option value="">Select…</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}
        </Field>
        <Field label="How urgent" as="select" value={f.severity} onChange={set("severity")} hint="Critical alerts also send an SMS to matching donors.">
          <option value="low">Running low</option><option value="critical">Critical</option>
        </Field>
        <Field label="Who to alert" as="select" value={f.audience} onChange={set("audience")}>
          <option value="both">Donors and the public</option><option value="donors">Matching donors only</option><option value="public">The public only</option>
        </Field>
        <div className="full"><Field label="Message (optional)" as="textarea" rows={2} value={f.message} error={errs.message} onChange={set("message")} hint="For example where to go and when. Up to 200 characters." /></div>
        <div className="full"><Button busy={busy === "send"} type="submit">Send alert</Button></div>
      </form>
      <p className="mute" style={{ margin: "12px 0" }}>Donors of that exact blood group who are available and not in their 56-day rest are notified. An alert ends on its own after 48 hours, and each hospital can send 5 per day.</p>
      <DataState loading={list.loading} error={list.error} onRetry={list.reload}>
        {(list.data?.alerts || []).length === 0 ? <Empty title="No alerts yet" text="Alerts you send will be listed here." /> : <Table columns={cols} rows={list.data.alerts} rowKey="alert_id" />}
      </DataState>
    </Card>
  );
}