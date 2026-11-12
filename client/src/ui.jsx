import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { AlertCircle, CheckCircle2, Inbox, Loader2 } from "lucide-react";
import { api } from "./api";

export const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const fmt = (d) => (d ? new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "–");

const TONE = { collected: "info", received: "warn", used: "ok", flagged: "bad", notified: "warn", confirmed: "ok", declined: "neutral",
  matching: "warn", matched: "ok", pending: "neutral", fulfilled: "ok", cancelled: "neutral", normal: "neutral", urgent: "warn", critical: "bad" };
export const StatusBadge = ({ value }) => <Badge tone={TONE[value]}>{String(value).replace("_", " ")}</Badge>;
export const Badge = ({ tone = "neutral", children }) => <span className={`badge ${tone}`}>{children}</span>;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = "ok") => {
    const id = crypto.randomUUID();
    setItems((i) => [...i, { id, message, type }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "ok" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useFetch(path, enabled = true) {
  const [s, set] = useState({ data: null, loading: enabled, error: null });
  const load = useCallback(async () => {
    if (!enabled) return;
    set((p) => ({ ...p, loading: true, error: null }));
    try { set({ data: await api(path), loading: false, error: null }); }
    catch (e) { set({ data: null, loading: false, error: e.message }); }
  }, [path, enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

export const Button = ({ busy, variant = "primary", className = "", children, ...p }) => (
  <button {...p} className={`btn ${variant} ${className}`.trim()} disabled={busy || p.disabled}>
    {busy && <Loader2 className="spin" size={16} />}{children}
  </button>
);

export function Field({ label, error, hint, as: As = "input", children, ...p }) {
  const id = useId();
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <As id={id} aria-invalid={!!error} aria-describedby={error ? id + "e" : undefined} {...p}>{children}</As>
      {hint && !error && <small>{hint}</small>}
      {error && <small id={id + "e"} className="err" role="alert">{error}</small>}
    </div>
  );
}

export const Card = ({ title, children }) => <section className="card">{title && <h3>{title}</h3>}{children}</section>;
export const PageHead = ({ title, sub }) => <div className="pagehead"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>;
export const Empty = ({ title, text }) => <div className="empty"><Inbox size={32} /><strong>{title}</strong>{text}</div>;
export const FormAlert = ({ children }) => children ? <div className="alert" role="alert"><AlertCircle size={18} />{children}</div> : null;

export function DataState({ loading, error, onRetry, children }) {
  if (loading) return <div aria-busy="true"><div className="sk" /><div className="sk" style={{ width: "70%" }} /><div className="sk" style={{ width: "85%" }} /></div>;
  if (error) return <div className="alert" role="alert"><AlertCircle size={18} /><div>{error} {onRetry && <button className="btn ghost sm" onClick={onRetry}>Try again</button>}</div></div>;
  return children;
}

export function Table({ columns, rows, rowKey }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]}>{columns.map((c) => <td key={c.key} data-label={c.label}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Confirm({ open, title, text, confirmLabel, busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="scrim" onClick={onCancel} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" onClick={(e) => e.stopPropagation()}>
        <h3 id="dlg-t">{title}</h3><p className="mute" style={{ marginTop: 8 }}>{text}</p>
        <div className="row"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button busy={busy} onClick={onConfirm} autoFocus>{confirmLabel}</Button></div>
      </div>
    </div>
  );
}

export const FilterSelect = ({ value, onChange, options, label }) => (
  <Field label={label} as="select" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="all">All</option>{options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
  </Field>
);