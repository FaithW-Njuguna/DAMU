import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const Ctx = createContext({ unread: 0, refresh() {} });

export const useUnread = () => useContext(Ctx);

// Keeps the unread badge fresh: when someone logs in, every 45 seconds while
// the tab is visible, and whenever they come back to the tab.
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return setUnread(0);

    try {
      const data = await api("/notifications/unread-count");
      setUnread(data.unread);
    } catch {
      // The badge is a convenience, so a failed check stays quiet.
    }
  }, [user]);

  useEffect(() => {
    refresh();

    if (!user) return undefined;

    const whenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = setInterval(whenVisible, 45000);
    document.addEventListener("visibilitychange", whenVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [refresh, user]);

  return <Ctx.Provider value={{ unread, refresh }}>{children}</Ctx.Provider>;
}