import { useState } from "react";
import { Badge, Card, DataState, PageHead, Table, useFetch } from "../ui";

const WINDOWS = [[30, "30 days"], [90, "90 days"], [365, "1 year"]];

const Bar = ({ value, max }) => (
  <div className="bar"><i style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>
);

const Chips = ({ list, tone, empty }) =>
  list.length
    ? <div className="chips">{list.map((b) => <Badge key={b} tone={tone}>{b}</Badge>)}</div>
    : <p className="mute">{empty}</p>;

export default function Insights() {
  const [days, setDays] = useState(90);
  const d = useFetch(`/insights/blood-groups?days=${days}`);
  const groups = d.data?.groups || [];
  const maxUnits = Math.max(1, ...groups.map((g) => g.units_requested));
  const maxDonors = Math.max(1, ...groups.map((g) => g.donors_available));
  const needed = d.data?.most_needed || [];
  const hard = d.data?.hardest_to_find || [];
  const collect = d.data?.collect_more || [];

  const cols = [
    { key: "blood_type", label: "Blood group", render: (g) => <Badge tone="bad">{g.blood_type}</Badge> },
    { key: "units_requested", label: "Units needed", render: (g) => <div style={{ minWidth: 120 }}><strong>{g.units_requested}</strong> <small className="mute">in {g.requests} request{g.requests === 1 ? "" : "s"}</small><Bar value={g.units_requested} max={maxUnits} /></div> },
    { key: "donors_available", label: "Donors available now", render: (g) => <div style={{ minWidth: 120 }}><strong>{g.donors_available}</strong> <small className="mute">of {g.donors_registered}</small><Bar value={g.donors_available} max={maxDonors} /></div> },
    { key: "filled_rate", label: "Requests filled", render: (g) => g.filled_rate == null ? "–" : `${g.filled_rate}%` },
    { key: "median_hours_to_confirm", label: "Typical wait for a donor", render: (g) => g.median_hours_to_confirm == null ? "–" : g.median_hours_to_confirm < 1 ? "under 1 hour" : `${g.median_hours_to_confirm} h` },
    { key: "flags", label: "", render: (g) => (
      <div className="chips">
        {needed.includes(g.blood_type) && <Badge tone="info">Most needed</Badge>}
        {hard.includes(g.blood_type) && <Badge tone="bad">Hard to find</Badge>}
        {collect.includes(g.blood_type) && <Badge tone="warn">Collect more</Badge>}
      </div>) }
  ];

  return (
    <div className="stack">
      <PageHead title="Blood insights" sub="Which blood groups are needed most, and which are hardest to find. Totals only, with no personal details." />
      <div className="seg" role="group" aria-label="Time period">
        {WINDOWS.map(([n, l]) => <button key={n} aria-pressed={days === n} className={`btn ghost sm${days === n ? " on" : ""}`} onClick={() => setDays(n)}>{l}</button>)}
      </div>
      <DataState loading={d.loading} error={d.error} onRetry={d.reload}>
        {d.data && <>
          {!d.data.enough_data && (
            <div className="alert" role="note"><div>Only {d.data.total_requests} request{d.data.total_requests === 1 ? "" : "s"} in this period so far, so treat these figures as early signs rather than firm conclusions.</div></div>
          )}
          <div className="grid">
            <Card title="Most needed"><Chips list={needed} tone="info" empty="No requests in this period yet." /></Card>
            <Card title="Hardest to find"><Chips list={hard} tone="bad" empty="Nothing to show yet." /></Card>
            <Card title="Donors we need most"><Chips list={collect} tone="warn" empty="Nothing to show yet." /></Card>
          </div>
          <Card title="By blood group"><Table columns={cols} rows={groups} rowKey="blood_type" /></Card>
          <Card title="How to read this">
            <ul className="plain">
              <li><strong>Most needed:</strong> the groups with the most units requested. Cancelled requests are not counted.</li>
              <li><strong>Hard to find:</strong> units requested for each donor who could give to that group and is available now. A higher figure means fewer donors for the demand.</li>
              <li><strong>Donors we need most:</strong> how much demand a donor group could serve, compared with how many of those donors are available. O- is wanted by every patient, so it often appears here.</li>
              <li><strong>Typical wait for a donor:</strong> the middle time between a request being posted and its first donor confirming.</li>
            </ul>
          </Card>
        </>}
      </DataState>
    </div>
  );
}