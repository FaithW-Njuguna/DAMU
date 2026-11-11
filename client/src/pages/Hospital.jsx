import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Button, Card, Confirm, DataState, Empty, FilterSelect, FormAlert, PageHead, StatusBadge, Table, fmt, useFetch, useToast } from "../ui";

const NEXT = { collected: [["received", "Mark received"]], received: [["used", "Mark used"]] };

export default function Hospital() {
  const { user } = useAuth();
  const toast = useToast();
  const linked = !!user.hospital_id;
  const matches = useFetch("/units/confirmed-matches", linked);
  const units = useFetch("/units", linked);
  const [filter, setFilter] = useState("all");
  const [flag, setFlag] = useState(null);
  const [busy, setBusy] = useState("");

  if (!linked) return <><PageHead title="Unit tracking" /><FormAlert>Your account isn't linked to a hospital yet. Ask the DAMU administrator to link it, then log in again.</FormAlert></>;

  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); toast(ok); matches.reload(); units.reload(); } catch (e) { toast(e.message, "err"); }
    setBusy(""); setFlag(null);
  };
  const collect = (m) => run(m.match_id, () => api("/units", { method: "POST", body: { match_id: m.match_id, hospital_id: user.hospital_id } }), "Collection logged");
  const setStatus = (u, status) => run(u.unit_id + status, () => api(`/units/${u.unit_id}/status`, { method: "PATCH", body: { status } }), `Unit marked ${status}`);

  const rows = (units.data?.units || []).filter((u) => filter === "all" || u.status === filter);
  const mcols = [
    { key: "tracking_code", label: "Donor tracking code", render: (m) => <span className="code">{m.tracking_code}</span> },
    { key: "blood_type", label: "Blood type" },
    { key: "location", label: "Requested at" },
    { key: "response_at", label: "Confirmed", render: (m) => fmt(m.response_at) },
    { key: "act", label: "Action", render: (m) => <Button className="sm" busy={busy === m.match_id} onClick={() => collect(m)}>Log collection</Button> }
  ];
  const ucols = [
    { key: "tracking_code", label: "Unit code", render: (u) => <span className="code">{u.tracking_code}</span> },
    { key: "status", label: "Status", render: (u) => <StatusBadge value={u.status} /> },
    { key: "collection_date", label: "Collected", render: (u) => fmt(u.collection_date).split(",").slice(0, 2).join(",") },
    { key: "act", label: "Action", render: (u) => (
      <span className="row" style={{ gap: 8 }}>
        {(NEXT[u.status] || []).map(([s, l]) => <Button key={s} className="sm" busy={busy === u.unit_id + s} onClick={() => setStatus(u, s)}>{l}</Button>)}
        {NEXT[u.status] && <Button variant="ghost" onClick={() => setFlag(u)}>Flag</Button>}
      </span>) }
  ];
  return (
    <div className="stack">
      <PageHead title="Unit tracking" sub="Log each donated unit from collection to confirmed use. Units with no confirmed use after 14 days are flagged automatically." />
      <Card title="Confirmed donors awaiting collection">
        <DataState loading={matches.loading} error={matches.error} onRetry={matches.reload}>
          {(matches.data?.matches || []).length ? <Table columns={mcols} rows={matches.data.matches} rowKey="match_id" /> : <Empty title="No donors waiting" text="Donors who confirm a request will appear here." />}
        </DataState>
      </Card>
      <Card title="Your units">
        <DataState loading={units.loading} error={units.error} onRetry={units.reload}>
          {(units.data?.units || []).length === 0 ? <Empty title="No units logged yet" text="Log a collection above to start tracking a unit." /> : <>
            <div style={{ maxWidth: 220, marginBottom: 12 }}><FilterSelect label="Status" value={filter} onChange={setFilter} options={["collected", "received", "used", "flagged"]} /></div>
            {rows.length ? <Table columns={ucols} rows={rows} rowKey="unit_id" /> : <Empty title="Nothing matches this filter" text="" />}
          </>}
        </DataState>
      </Card>
      <Confirm open={!!flag} busy={!!flag && busy === flag.unit_id + "flagged"} title="Flag this unit?" text="Flagged units are sent to the regulator review queue and cannot be changed afterwards."
        confirmLabel="Flag unit" onConfirm={() => setStatus(flag, "flagged")} onCancel={() => setFlag(null)} />
    </div>
  );
}