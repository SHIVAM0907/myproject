// Session for the employee/manager subsystem.
//
// Owns the token in EMPLOYEE_TOKEN_KEY and the signed-in EmployeeUser. It
// deliberately does NOT touch the platform token in PLATFORM_TOKEN_KEY: the two
// realms are independent (see lib/employeeApi), and signing out of the employee
// dashboard must not sign the user out of the rest of the app.

import React from "react";
import employeeApi, {
  clearEmployeeSession,
  getEmployeeToken,
} from "../lib/employeeApi";
import type { EmployeeUser } from "../types/Employee";

type EmployeeAuthValue = {
  employee: EmployeeUser | null;
  loading: boolean;
  error: string | null;
  setEmployee: (employee: EmployeeUser | null) => void;
  refreshEmployee: () => Promise<EmployeeUser | null>;
  logout: () => void;
};

const EmployeeAuthContext = React.createContext<EmployeeAuthValue | null>(null);

export const EmployeeAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [employee, setEmployee] = React.useState<EmployeeUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshEmployee = React.useCallback(async (): Promise<EmployeeUser | null> => {
    try {
      setError(null);
      const res = await employeeApi.get<{ employee: EmployeeUser }>("/me");
      const next = res.data?.employee ?? null;
      setEmployee(next);
      return next;
    } catch (err: any) {
      // employeeApi has already cleared the token on a 401, so drop the cached
      // user too rather than leaving a signed-out shell showing their name.
      if (err.response?.status === 401) setEmployee(null);
      else setError(err.response?.data?.message || "Could not load your account.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!getEmployeeToken()) {
      setLoading(false);
      return;
    }
    refreshEmployee();
  }, [refreshEmployee]);

  const logout = React.useCallback(() => {
    clearEmployeeSession();
    setEmployee(null);
    setError(null);
  }, []);

  const value = React.useMemo(
    () => ({ employee, loading, error, setEmployee, refreshEmployee, logout }),
    [employee, loading, error, refreshEmployee, logout],
  );

  return <EmployeeAuthContext.Provider value={value}>{children}</EmployeeAuthContext.Provider>;
};

// A login screen renders outside the provider, so report "signed out" there
// instead of throwing - that keeps the hook usable in route guards.
export function useEmployeeAuth(): EmployeeAuthValue {
  return React.useContext(EmployeeAuthContext) ?? {
    employee: null,
    loading: false,
    error: null,
    setEmployee: () => {},
    refreshEmployee: async () => null,
    logout: () => {},
  };
}

export default EmployeeAuthContext;