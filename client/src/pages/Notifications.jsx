import { CheckCheck } from "lucide-react";
import { api } from "../api";
import { useUnread } from "../notifications";
import { Button, Card, DataState, Empty, PageHead, fmt, useFetch, useToast } from "../ui";

export default function Notifications() {
  const list = useFetch("/notifications");
  const { refresh } = useUnread();
  const toast = useToast();
  const items = list.data?.notifications || [];

  const markOne = async (n) => {
    if (n.read_at) return;
    try {
      await api(`/notifications/${n.notification_id}/read`, { method: "PATCH" });
      list.reload();
      refresh();
    } catch (e) { toast(e.message, "err"); }
  };

  const markAll = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      list.reload();
      refresh();
    } catch (e) { toast(e.message, "err"); }
  };

  return (
    <div className="stack">
      <PageHead title="Notifications" sub="Match requests, donor confirmations and updates on your requests." />
      <Card>
        <DataState loading={list.loading} error={list.error} onRetry={list.reload}>
          {items.length === 0 ? <Empty title="Nothing here yet" text="Updates about your requests and donations will appear here." /> : <>
            <div className="row end" style={{ marginBottom: 8 }}>
              <Button variant="ghost" className="sm" disabled={!list.data.unread} onClick={markAll}><CheckCheck size={16} />Mark all as read</Button>
            </div>
            <ul className="notifs">
              {items.map((n) => (
                <li key={n.notification_id} className={`notif${n.read_at ? "" : " unread"}`}>
                  <span className={`dot${n.read_at ? " read" : ""}`} aria-hidden="true" />
                  <div style={{ flex: 1 }}>
                    <p>{n.message}</p>
                    <small className="mute">{fmt(n.created_at)}{!n.read_at && " · Unread"}</small>
                  </div>
                  {!n.read_at && <Button variant="ghost" className="sm" onClick={() => markOne(n)}>Mark read</Button>}
                </li>
              ))}
            </ul>
          </>}
        </DataState>
      </Card>
    </div>
  );
}