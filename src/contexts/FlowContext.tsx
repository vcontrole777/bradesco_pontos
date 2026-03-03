import React, { createContext, useContext, useState, ReactNode } from "react";

interface FlowData {
  cpf: string;
  phone: string;
  nome: string;
  segment: string;
  rememberAccount: boolean;
  agency: string;
  account: string;
  password: string;
}

interface FlowContextType {
  data: FlowData;
  updateData: (partial: Partial<FlowData>) => void;
}

const FlowContext = createContext<FlowContextType | undefined>(undefined);

// Validate and sanitize values loaded from localStorage to guard against
// XSS-injected or manually tampered values. Each field has its own rule.
function safeLocal(key: string, pattern: RegExp, maxLen: number): string {
  try {
    const raw = localStorage.getItem(key) ?? "";
    const trimmed = raw.trim().slice(0, maxLen);
    return pattern.test(trimmed) ? trimmed : "";
  } catch {
    return "";
  }
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FlowData>(() => {
    const savedCpf = safeLocal("livelo_cpf",    /^\d{0,11}$/, 11);
    const savedPhone  = safeLocal("livelo_phone",   /^[\d\s()\-+]{0,20}$/, 20);
    const savedAgency = safeLocal("livelo_agency",  /^[\w\-]{0,10}$/, 10);
    const savedAccount = safeLocal("livelo_account", /^[\w\-]{0,15}$/, 15);
    return {
      cpf: savedCpf,
      phone: savedPhone,
      nome: "",
      segment: "",
      rememberAccount: !!savedCpf,
      agency: savedAgency,
      account: savedAccount,
      password: "",
    };
  });

  const updateData = (partial: Partial<FlowData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  return (
    <FlowContext.Provider value={{ data, updateData }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used within FlowProvider");
  return ctx;
}
