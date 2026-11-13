// Dedicated axios instance for the media store.
//
// `/api/upload` is deliberately NOT mounted under `/api/employee`, so
// `employeeApi` cannot reach these routes with the right base path -- that is
// why this file exists rather than reusing employeeApi's URL. But the routes are
// still behind `requireEmployee`, so the employee token has to ride along.
//
// An earlier version of these call sites used bare `axios`, which sent no
// Authorization header at all. Every call 401'd: profile pictures silently fell
// back to initials (getImageUrl swallows failures by design) and task
// attachments failed outright. A shared instance keeps the header from being
// forgotten at the next call site.

import axios from 'axios'

import { getEmployeeToken } from './employeeApi'

export const uploadApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL}/api/upload`,
})

uploadApi.interceptors.request.use((config) => {
  const token = getEmployeeToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// No 401 interceptor on purpose. `employeeApi` signs the user out, but these
// routes are also called during render by `getProfileImageUrl`, which is
// documented never to reject and falls back to initials. Clearing the session
// from there would turn a missing picture into a logout.

/**
 * Headers for the direct byte PUT to an upload URL.
 *
 * The local (non-R2) backend authenticates the PUT against the metadata record
 * created by get-upload-url (ownership + magic-byte validation, P3), so the
 * employee token must ride along. The R2 presigned URL ignores the extra
 * header, so sending it unconditionally is safe for both backends.
 */
export function uploadPutHeaders(contentType: string): Record<string, string> {
  const token = getEmployeeToken()
  const headers: Record<string, string> = { 'Content-Type': contentType }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * Headers for fetching a stored file. Locally-stored files are served through
 * an authenticated route, so <img>/<object> requests must carry the token too.
 */
export function fileFetchHeaders(): Record<string, string> {
  const token = getEmployeeToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default uploadApi