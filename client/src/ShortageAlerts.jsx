import { Siren } from "lucide-react";
import { Badge, fmt, useFetch } from "./ui";

// Blood shortages that hospitals have shared with the public. Shows nothing
// when there are none. Pass the donor's own blood group to highlight a match.
export default function ShortageAlerts({ bloodType }) {
  const alerts = useFetch("/alerts/public");
  const list = alerts.data?.alerts || [];

  if (!list.length) return null;

  return (
    <section className="shortage" aria-label="Blood shortage alerts">
      <h3><Siren size={18} />Blood needed now</h3>
      <ul>
        {list.map((a) => (
          <li key={a.alert_id} className={`shortage-item ${a.severity}`}>
            <span className="shortage-type">{a.blood_type}</span>
            <div>
              <strong>{a.hospital_name}</strong> <span className="mute">· {a.hospital_location}</span>
              {a.message && <p>{a.message}</p>}
              <small className="mute">
                Posted {fmt(a.created_at)}{bloodType === a.blood_type ? " · Matches your blood group" : ""}
              </small>
            </div>
            <Badge tone={a.severity === "critical" ? "bad" : "warn"}>{a.severity === "critical" ? "Critical" : "Running low"}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}