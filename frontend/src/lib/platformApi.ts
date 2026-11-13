// axios instance for the platform/admin realm.
//
// Kept separate from employeeApi because the two realms use different
// localStorage keys and different JWT secrets — see AuthContext and
// EmployeeAuthContext. employeeApi attaches `employee_token`; this attaches
// `token`, so a manager signed in to /admin and signed in to /employee at the
// same time never overwrite each other's session.

import axios from "axios";
import { PLATFORM_TOKEN_KEY } from "./employeeApi";

const baseURL = `${import.meta.env.VITE_API_BASE_URL}/api`;

export const platformApi = axios.create({ baseURL });

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PLATFORM_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected platform token means the session is over. Clearing it here
    // stops the admin screens from looping on refresh after an expiry. P5:
    // tokens are short-lived (15m); there is deliberately no silent refresh
    // request loop — the route guard's redirect IS the recovery path.
    if (error.response?.status === 401) {
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
    }
    return Promise.reject(error);
  },
);

export default platformApi;