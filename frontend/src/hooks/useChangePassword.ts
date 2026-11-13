// Password change for the employee/manager subsystem.
//
// changePassword resolves to a boolean and never rejects: the settings screens
// `await` it and only clear their input boxes when it returns true, so a thrown
// error would skip the "did it work?" check and leave the form in limbo.

import { useCallback, useState } from "react";
import employeeApi from "../lib/employeeApi";

type PasswordScope = "employee" | "manager";

// CONFIRM: no password route exists in the backend yet. This is the employee
// realm (employeeApi is scoped to /api/employee); point it at the real route.
const passwordPath = (_scope: PasswordScope) => "/password";

export function useChangePassword(scope: PasswordScope = "employee") {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        await employeeApi.put(passwordPath(scope), { currentPassword, newPassword });
        setSuccess(true);
        return true;
      } catch (err: any) {
        setError(err.response?.data?.message || "Could not update your password.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [scope],
  );

  return { changePassword, loading, error, success };
}

export default useChangePassword;