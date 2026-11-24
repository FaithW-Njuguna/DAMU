import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { homeFor, useAuth } from "../auth";
import { Button, Card, Field, FormAlert, PageHead, useToast } from "../ui";

export default function ChangePassword() {
  const { user, patchUser } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const forced = !!user.must_change_password;
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!f.current_password) v.current_password = forced ? "Enter the temporary password you were given" : "Enter your current password";
    if (f.new_password.length < 10) v.new_password = "Use at least 10 characters";
    else if (f.new_password === f.current_password) v.new_password = "Choose a password you haven't used for this account";
    if (f.confirm !== f.new_password) v.confirm = "The passwords don't match";
    setErrs(v); setFormErr("");
    if (Object.keys(v).length) return;

    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: f.current_password, new_password: f.new_password } });
      patchUser({ must_change_password: false });
      toast("Password updated");
      nav(homeFor(user.role), { replace: true });
    } catch (er) { setFormErr(er.message); }
    setBusy(false);
  };

  return (
    <div className="stack">
      <PageHead title="Change password" sub={forced ? "Your account was set up with a temporary password. Choose your own to continue." : "Choose a new password for your account."} />
      <Card>
        <form className="form" onSubmit={submit} noValidate>
          <FormAlert>{formErr}</FormAlert>
          <Field label={forced ? "Temporary password" : "Current password"} type="password" autoComplete="current-password" value={f.current_password} error={errs.current_password} onChange={set("current_password")} />
          <Field label="New password" type="password" autoComplete="new-password" hint="At least 10 characters." value={f.new_password} error={errs.new_password} onChange={set("new_password")} />
          <Field label="Confirm new password" type="password" autoComplete="new-password" value={f.confirm} error={errs.confirm} onChange={set("confirm")} />
          <Button busy={busy} type="submit">Save password</Button>
        </form>
      </Card>
    </div>
  );
}