/** Google Drive push for saved printouts. Browser-only OAuth through Google
 * Identity Services with the `drive.file` scope, which can only see files
 * this app created: no access to the rest of the Drive, and no secret in the
 * page. The OAuth client id comes from org settings; swapping it for IT's
 * Workspace project later changes nothing else here. */

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void
}
interface Gis {
  accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void; error_callback?: (e: { type?: string; message?: string }) => void }) => TokenClient } }
}
declare global {
  interface Window {
    google?: Gis
  }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Could not load Google sign-in. Check the connection.'))
      document.head.appendChild(s)
    })
  }
  return gisLoading
}

let cached: { token: string; expiresAt: number; clientId: string } | null = null

/** An access token for Drive, asking the user to sign in the first time. */
export async function driveToken(clientId: string): Promise<string> {
  if (cached && cached.clientId === clientId && cached.expiresAt > Date.now() + 60_000) return cached.token
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${r.error ?? 'no token'}).`))
          return
        }
        cached = { token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000, clientId }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in window was closed.' : e.message ?? 'Google sign-in failed.')),
    })
    client.requestAccessToken({ prompt: cached ? '' : 'consent' })
  })
}

export function forgetDriveToken() {
  cached = null
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } })
  if (r.status === 401) cached = null
  return r
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** A folder by name under a parent (root when none), created if missing. */
export async function ensureFolder(token: string, name: string, parentId: string | null): Promise<string> {
  const query = `name = '${q(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`
  const r = await driveFetch(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=5`)
  if (!r.ok) throw new Error(`Drive lookup failed (${r.status}).`)
  const found = ((await r.json()) as { files?: Array<{ id: string }> }).files?.[0]
  if (found) return found.id
  const c = await driveFetch(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  })
  if (!c.ok) throw new Error(`Could not create the Drive folder (${c.status}).`)
  return ((await c.json()) as { id: string }).id
}

/** Upload one file (multipart) into a folder. Returns the file id and link. */
export async function uploadFile(token: string, folderId: string, name: string, blob: Blob): Promise<{ id: string; url: string }> {
  const meta = { name, parents: [folderId] }
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  body.append('file', blob)
  const r = await driveFetch(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', body })
  if (!r.ok) throw new Error(`Drive upload failed (${r.status}).`)
  const j = (await r.json()) as { id: string; webViewLink?: string }
  return { id: j.id, url: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view` }
}

/** Push a printout to Drive under <root folder>/<trial name>/. */
export async function pushPrintoutToDrive(clientId: string, rootFolder: string, trialName: string, filename: string, html: string): Promise<{ id: string; url: string }> {
  const token = await driveToken(clientId)
  const root = await ensureFolder(token, rootFolder, null)
  const trialFolder = await ensureFolder(token, trialName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Trial', root)
  return uploadFile(token, trialFolder, filename, new Blob([html], { type: 'text/html' }))
}
