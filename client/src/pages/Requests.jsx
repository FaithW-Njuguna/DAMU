import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { BLOOD, Button, Card, DataState, Empty, Field, FilterSelect, FormAlert, PageHead, StatusBadge, Table, fmt, useFetch, useToast } from "../ui";

export default function Requests() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useFetch("/requests/mine");
  const hosp = useFetch("/hospitals");
  const [f, setF] = useState({ blood_type: "", units_required: 1, urgency: "normal", location: "", hospital_id: user.hospital_id || "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!f.blood_type) v.blood_type = "Choose the blood type needed";
    if (!Number.isInteger(Number(f.units_required)) || Number(f.units_required) < 1) v.units_required = "Enter a whole number, 1 or more";
    if (f.location.trim().length < 2) v.location = "Enter where the blood is needed";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const d = await api("/requests", { method: "POST", body: { ...f, units_required: Number(f.units_required), location: f.location.trim(), hospital_id: f.hospital_id || undefined } });
      toast(d.candidates_notified ? `Request sent to ${d.candidates_notified} compatible donor${d.candidates_notified > 1 ? "s" : ""}` : "Request saved, but no compatible available donors were found yet", d.candidates_notified ? "ok" : "err");
      setF({ ...f, blood_type: "", units_required: 1, location: "" });
      list.reload();
    } catch (er) { setFormErr(er.message); }
    setBusy(false);
  };

  const rows = (list.data?.requests || []).filter((r) => filter === "all" || r.status === filter);
  const cols = [
    { key: "need", label: "Need", render: (r) => `${r.blood_type}, ${r.units_required} unit${r.units_required > 1 ? "s" : ""}` },
    { key: "urgency", label: "Urgency", render: (r) => <StatusBadge value={r.urgency} /> },
    { key: "where", label: "Where", render: (r) => r.hospital_name || r.location },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
    { key: "donors", label: "Donors", render: (r) => `${r.donors_confirmed} confirmed / ${r.donors_notified} asked` },
    { key: "created_at", label: "Posted", render: (r) => fmt(r.created_at) }
  ];
  return (
    <div className="stack">
      <PageHead title="Blood requests" sub="Post a request and DAMU notifies compatible, available donors." />
      <Card title="New request">
        <form className="form wide" onSubmit={submit} noValidate>
          <div className="full"><FormAlert>{formErr}</FormAlert></div>
          <Field label="Blood type needed" as="select" value={f.blood_type} error={errs.blood_type} onChange={set("blood_type")}><option value="">Select…</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</Field>
          <Field label="Units required" type="number" min="1" value={f.units_required} error={errs.units_required} onChange={set("units_required")} />
          <Field label="Urgency" as="select" value={f.urgency} onChange={set("urgency")}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="critical">Critical</option></Field>
          <Field label="Location" placeholder="Area or sub-county" value={f.location} error={errs.location} onChange={set("location")} />
          <Field label="Hospital (optional)" as="select" value={f.hospital_id} onChange={set("hospital_id")} disabled={!!user.hospital_id}>
            <option value="">Not listed</option>{(hosp.data?.hospitals || []).map((h) => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
          </Field>
          <div className="full"><Button busy={busy} type="submit">Send request</Button></div>
        </form>
      </Card>
      <Card title="Your requests">
        <DataState loading={list.loading} error={list.error} onRetry={list.reload}>
          {(list.data?.requests || []).length === 0 ? <Empty title="No requests yet" text="Requests you post will be listed here with their match progress." /> : <>
            <div style={{ maxWidth: 220, marginBottom: 12 }}><FilterSelect label="Status" value={filter} onChange={setFilter} options={["matching", "matched", "fulfilled", "cancelled"]} /></div>
            {rows.length ? <Table columns={cols} rows={rows} rowKey="request_id" /> : <Empty title="Nothing matches this filter" text="" />}
          </>}
        </DataState>
      </Card>
    </div>
  );
}