import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, session, setAuthFailHandler } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export const homeFor = (role) =>
  ({ donor: "/donor", patient: "/requests", hospital: "/hospital", regulator: "/regulator", admin: "/admin" }[role] || "/");

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("damu_user")); } catch { return null; }
  });

  const save = (u, t) => {
    session.set(t);
    u ? sessionStorage.setItem("damu_user", JSON.stringify(u)) : sessionStorage.removeItem("damu_user");
    setUser(u);
  };
  const login = async (phone_number, password) => {
    const d = await api("/auth/login", { method: "POST", body: { phone_number, password } });
    save(d.user, d.token);
    return d.user;
  };
  const logout = () => { save(null, null); navigate("/"); };

  useEffect(() => {
    setAuthFailHandler(() => { save(null, null); navigate("/login", { state: { expired: true } }); });
  }, [navigate]);

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}