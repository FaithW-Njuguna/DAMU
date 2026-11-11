import { Card, DataState, Empty, PageHead, StatusBadge, Table, fmt, useFetch } from "../ui";

export default function Regulator() {
  const flagged = useFetch("/units/flagged");
  const reports = useFetch("/reports/whistleblower");
  const ucols = [
    { key: "tracking_code", label: "Unit code", render: (u) => <span className="code">{u.tracking_code}</span> },
    { key: "hospital_name", label: "Hospital", render: (u) => u.hospital_name || "–" },
    { key: "collection_date", label: "Collected", render: (u) => fmt(u.collection_date).split(",").slice(0, 2).join(",") },
    { key: "status", label: "Status", render: (u) => <StatusBadge value={u.status} /> }
  ];
  const rcols = [
    { key: "created_at", label: "Received", render: (r) => fmt(r.created_at) },
    { key: "hospital_name", label: "Hospital", render: (r) => r.hospital_name || "Not specified" },
    { key: "report_text", label: "Report" },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> }
  ];
  return (
    <div className="stack">
      <PageHead title="Review queue" sub="Units that were not accounted for, and anonymous reports from health workers." />
      <Card title="Flagged units">
        <DataState loading={flagged.loading} error={flagged.error} onRetry={flagged.reload}>
          {(flagged.data?.units || []).length ? <Table columns={ucols} rows={flagged.data.units} rowKey="unit_id" /> : <Empty title="Nothing flagged" text="Units with no confirmed use after 14 days will appear here." />}
        </DataState>
      </Card>
      <Card title="Anonymous reports">
        <DataState loading={reports.loading} error={reports.error} onRetry={reports.reload}>
          {(reports.data?.reports || []).length ? <Table columns={rcols} rows={reports.data.reports} rowKey="report_id" /> : <Empty title="No reports" text="Reports submitted through the public form will appear here." />}
        </DataState>
      </Card>
    </div>
  );
}