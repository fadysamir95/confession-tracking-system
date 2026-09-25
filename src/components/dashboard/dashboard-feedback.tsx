"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckIcon } from "@/components/ui/icons";

const FeedbackContext = createContext<(message: string) => void>(() => undefined);

export function useDashboardFeedback() {
  return useContext(FeedbackContext);
}

export function DashboardFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 4_500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  return (
    <FeedbackContext.Provider value={setMessage}>
      {children}
      {message ? (
        <div className="action-toast" role="status">
          <CheckIcon /> {message}
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}
