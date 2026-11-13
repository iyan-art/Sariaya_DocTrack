import axios from 'axios';

// VITE_API_BASE_URL (set at build time) covers a backend hosted at any other URL.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (
  import.meta.env.PROD
    ? 'https://sariaya-doctrack-backend-3ab4.onrender.com/api'
    : 'http://127.0.0.1:8000/api'
);

// Some API responses give media files as a path rather than a full URL.
export const mediaUrl = (path) => {
  if (!path) return null;
  return path.startsWith('http') ? path : `${new URL(API_BASE_URL).origin}${path}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach access token to every outgoing request, if we have one
api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('access_token');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// The backend rotates refresh tokens and blacklists the old one, so each can be
// used only once. Requests failing together, in this tab or another, must
// therefore take turns: whoever goes first refreshes, and the rest find a newer
// access token waiting and reuse it.
function withRefreshLock(task) {
  return navigator.locks ? navigator.locks.request('token-refresh', task) : task();
}

function getFreshAccessToken(expiredAuthHeader) {
  return withRefreshLock(async () => {
    const currentToken = localStorage.getItem('access_token');
    if (currentToken && `Bearer ${currentToken}` !== expiredAuthHeader) return currentToken;

    const res = await axios.post(`${API_BASE_URL}/accounts/login/refresh/`, {
      refresh: localStorage.getItem('refresh_token'),
    });
    localStorage.setItem('access_token', res.data.access);
    if (res.data.refresh) localStorage.setItem('refresh_token', res.data.refresh);
    return res.data.access;
  });
}

// If a request fails because the access token expired (401),
// try to refresh it once, then retry the original request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const accessToken = await getFreshAccessToken(originalRequest.headers.Authorization);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest); // retry the original failed request
        } catch (refreshError) {
          // refresh token itself is invalid/expired -> force logout
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);


// --- Public Landing page content (no auth required) ---

export const fetchPublicAnnouncements = () => api.get('/documents/announcements/');
export const fetchPublicEvents = () => api.get('/documents/events/');

// --- Admin News & Events page: kind is 'news' or 'events'. Saves send
// FormData so a picture can go with them (multipart).
const MANAGED_CONTENT = { news: '/documents/announcements/manage/', events: '/documents/events/manage/' };
export const fetchManagedContent = (kind) => api.get(MANAGED_CONTENT[kind]);
export const saveManagedContent = (kind, id, formData) => (
  id ? api.patch(`${MANAGED_CONTENT[kind]}${id}/`, formData) : api.post(MANAGED_CONTENT[kind], formData)
);
export const deleteManagedContent = (kind, id) => api.delete(`${MANAGED_CONTENT[kind]}${id}/`);
export const fetchPublicOffices = () => api.get('/offices/public/');
export const fetchPublicDocumentTypes = () => api.get('/documents/types/public/');


// --- User Management API calls ---

export const fetchUsers = (role = 'citizen', status = '', page = 1) => {
  const params = new URLSearchParams({ role, page });
  if (status) params.append('status', status);
  return api.get(`/accounts/users/?${params.toString()}`);
};

export const createEmployee = (data) => {
  return api.post('/accounts/users/create-employee/', data);
};

export const toggleUserActive = (userId) => {
  return api.patch(`/accounts/users/${userId}/toggle-active/`);
};

// Generates and sets a brand-new secure temp password, returned exactly
// once — there is no endpoint that returns an existing password.
export const resetUserPassword = (userId) => {
  return api.patch(`/accounts/users/${userId}/reset-password/`);
};

export const fetchOfficials = () => {
  return api.get('/accounts/officials/');
};

export const updateUser = (userId, data) => {
  return api.patch(`/accounts/users/${userId}/update/`, data);
};

// --- The signed-in user's own Profile & Settings ---
export const fetchMyProfile = () => api.get('/accounts/me/');
export const updateMyProfile = (data) => api.patch('/accounts/me/', data);
export const changeMyPassword = (data) => api.post('/accounts/me/password/', data);
export const uploadMyAvatar = (file) => {
  const data = new FormData();
  data.append('avatar', file);
  return api.put('/accounts/me/avatar/', data);
};
export const removeMyAvatar = () => api.delete('/accounts/me/avatar/');
export const fetchMyLinkedRequests = () => api.get('/accounts/me/linked-requests/');

// Admin-only system-wide audit trail (logins, etc.) — powers AdminAccessLogs.
export const fetchAccessLogs = (page = 1, action = '') => {
  const params = new URLSearchParams({ page });
  if (action) params.append('action', action);
  return api.get(`/accounts/access-logs/?${params.toString()}`);
};

// Admin-only audit trail of automated emails (SLA overdue/due-soon warnings,
// citizen ready-for-release notices) — powers EmailNotificationBell, the
// admin's only access point for this activity (there is no separate page for it).
export const fetchEmailNotifications = (page = 1, type = '', status = '') => {
  const params = new URLSearchParams({ page });
  if (type) params.append('type', type);
  if (status) params.append('status', status);
  return api.get(`/documents/email-notifications/?${params.toString()}`);
};

// Manually triggers the same SLA scans the background scheduler runs
// automatically, for instant verification/demo purposes.
export const runSlaScanNow = () => api.post('/documents/email-notifications/run-scan/');

// --- In-app Notifications (NotificationBell — both Admin and Employee) ---
// Distinct from the email-activity log above: these are real-time, per-user,
// mark-as-read inbox items (incoming/returned documents, expedite requests,
// bottleneck alerts, urgent feedback), not a diagnostic of outbound emails.

export const fetchNotifications = (page = 1, unreadOnly = false) => {
  const params = new URLSearchParams({ page });
  if (unreadOnly) params.append('unread', 'true');
  return api.get(`/notifications/?${params.toString()}`);
};

export const fetchUnreadNotificationCount = () => api.get('/notifications/unread-count/');

export const markNotificationRead = (id, isRead = true) => {
  return api.patch(`/notifications/${id}/read/`, { is_read: isRead });
};

export const markAllNotificationsRead = () => api.post('/notifications/mark-all-read/');

// Citizen "Follow-Up / Expedite Request" on their own delayed document.
export const expediteDocument = (id) => api.post(`/documents/${id}/expedite/`);


// --- Document API calls ---

export const fetchDocuments = (statusFilter = '', page = 1) => {
  const params = new URLSearchParams({ page });
  if (statusFilter) params.append('status', statusFilter);
  return api.get(`/documents/?${params.toString()}`);
};

export const fetchDocumentDetail = (id) => {
  return api.get(`/documents/${id}/`);
};

// Staff/admin delete — only while the document is still untouched at its
// origin office, unless the caller is an admin (server-side override).
export const deleteDocument = (id) => {
  return api.delete(`/documents/${id}/`);
};

// --- Citizen "My Documents" (view/print/download own requests only, no edit) ---

export const fetchMyDocuments = (page = 1) => {
  const params = new URLSearchParams({ page });
  return api.get(`/documents/mine/?${params.toString()}`);
};

export const fetchMyDocumentDetail = (id) => {
  return api.get(`/documents/mine/${id}/`);
};

// Citizen cancelling their own request — same "still untouched" rule as
// deleteDocument above, no admin override on this endpoint.
export const deleteMyDocument = (id) => {
  return api.delete(`/documents/mine/${id}/`);
};

// Per-office citizen evaluation of a RELEASED document — see
// DocumentEvaluationModal. GET returns the active evaluation survey plus
// which offices in the document's route are/aren't rated yet.
export const fetchDocumentEvaluation = (id) => {
  return api.get(`/documents/${id}/evaluation/`);
};

// One overall rating of the whole request:
// answers: [{ question, rating_value? | text_value? | selected_option_ids? }, ...]
export const submitDocumentEvaluation = (id, answers) => {
  return api.post(`/documents/${id}/evaluation/`, { answers });
};

// A citizen sending a RELEASED document of theirs back to the office that
// released it — see ReturnDocumentModal.jsx. `notes` is required server-side.
export const citizenReturnDocument = (id, notes) => {
  return api.patch(`/documents/${id}/citizen-return/`, { notes });
};

// Same overall evaluation, but for a guest with no account — reached by
// tracking number from the public Track page (see DocumentEvaluationModal).
export const fetchPublicDocumentEvaluation = (trackingNumber) => {
  return api.get(`/documents/track/${encodeURIComponent(trackingNumber)}/evaluation/`);
};

export const submitPublicDocumentEvaluation = (trackingNumber, answers) => {
  return api.post(`/documents/track/${encodeURIComponent(trackingNumber)}/evaluation/`, { answers });
};

export const createDocument = (data) => {
  return api.post('/documents/', data);
};

// Staff-facing citizen lookup, used to link a request being created to the
// requesting citizen's own account (see CitizenPicker.jsx).
export const searchCitizens = (query) => {
  return api.get('/accounts/citizens/search/', { params: { q: query } });
};

// Manual (non-QR) override. data: { action: 'release' | 'receive', office, notes }
export const transitionDocument = (id, data) => {
  return api.patch(`/documents/${id}/scan/`, data);
};

// "Release to Citizen" — hands a Completed document back to the citizen and
// triggers their "ready for pickup" email; separate from the release/receive
// chain. Response includes `email_status` ('sent'/'failed'/'skipped'/
// 'already_sent') alongside the document payload. For an internal document
// the server releases it to its originating office instead: `released_to`
// is 'origin_office' and no citizen email is sent (`email_status` null).
export const releaseToCitizen = (id, data = {}) => {
  return api.patch(`/documents/${id}/release/`, data);
};

// The office expected to hold a document reports that the paper never
// arrived; `notes` is required. markDocumentFound() clears it.
export const markDocumentFound = (id, data = {}) => api.patch(`/documents/${id}/mark-found/`, data);
export const flagDocumentMissing = (id, data = {}) => {
  return api.patch(`/documents/${id}/flag-missing/`, data);
};

// Staff-only: advances the citizen-facing processing-stage narrative
// (Document.processing_stage) that drives the Shopee-style tracking
// stepper — independent of the physical release/receive/return status
// above. data: { stage, note? }
export const updateDocumentStage = (id, data) => {
  return api.patch(`/documents/${id}/stage/`, data);
};

export const lookupDocumentByTracking = (trackingNumber) => {
  return api.get(`/documents/track/${trackingNumber}/`);
};

// Controlled Return/Receive: single call from a raw QR scan to a logged transfer.
// payload: { qr_payload, action: 'release' | 'receive' | 'return', notes }
export const transferDocument = (payload) => {
  return api.post('/documents/transfer/', payload);
};

// Role-aware "what is this QR code" lookup — resolves a scanned/typed
// payload to a document without performing any transfer. Staff get scan
// context (suggested action, dwell time, previous-office duration) for the
// Receive/Return confirmation modal; citizens/guests get a public-safe
// summary, or a 403 if the document is INTERNAL.
export const qrScanResolve = (payload) => {
  return api.post('/documents/qr/scan/', { payload });
};


export const fetchDashboardStats = () => api.get('/documents/dashboard-stats/');
export const fetchHeatmapData = () => api.get('/documents/heatmap/');

// Staff/employee-scoped equivalent of the two Admin Dashboard KPI panels
// (avg turnaround, avg citizen rating), filtered to the requester's office.
export const fetchMyOfficePerformance = () => api.get('/documents/my-office-performance/');

// Every document that has passed through the signed-in staff member's office.
export const fetchOfficeHistory = (page = 1, scope = 'all', search = '') => {
  const params = new URLSearchParams({ page, scope });
  if (search) params.append('search', search);
  return api.get(`/documents/office-history/?${params.toString()}`);
};

// Active-only — used by document-creation dropdowns (NewRequestModal, NewDocumentModal).
export const fetchDocumentTypes = () => {
  return api.get('/documents/types/');
};

// --- Workflow Builder (admin) API calls ---

// Includes inactive types too, since the builder needs to edit/reactivate them.
export const fetchAllDocumentTypes = () => {
  return api.get('/documents/types/?all=true');
};

export const fetchDocumentType = (id) => {
  return api.get(`/documents/types/${id}/`);
};

export const createDocumentType = (data) => {
  return api.post('/documents/types/', data);
};

export const updateDocumentType = (id, data) => {
  return api.patch(`/documents/types/${id}/`, data);
};

// Deleting important records needs the admin's password again (checked server-side).
export const deleteDocumentType = (id, password) => {
  return api.delete(`/documents/types/${id}/`, { data: { password } });
};

// Atomically replaces the full ordered step list for a document type.
// steps: [{ step_number, office (Office id), action_required, max_hours_allowed }, ...]
export const saveWorkflowSteps = (documentTypeId, steps) => {
  return api.put(`/documents/types/${documentTypeId}/steps/`, { steps });
};

// --- Office Manager (admin) API calls ---

// Active-only — used by dropdowns (Workflow Builder step editor, etc.).
export const fetchOffices = () => {
  return api.get('/offices/');
};

// Includes inactive offices too, since the manager needs to edit/reactivate them.
export const fetchAllOffices = () => {
  return api.get('/offices/?all=true');
};

export const createOffice = (data) => {
  return api.post('/offices/', data);
};

export const updateOffice = (id, data) => {
  return api.patch(`/offices/${id}/`, data);
};

export const deleteOffice = (id, password) => {
  return api.delete(`/offices/${id}/`, { data: { password } });
};

// --- Citizen Survey Engine (admin authoring) ---

// Includes inactive surveys too — admin Survey Manager only.
export const fetchAllSurveys = () => {
  return api.get('/documents/surveys/?all=true');
};

export const createSurvey = (data) => {
  return api.post('/documents/surveys/', data);
};

export const updateSurvey = (id, data) => {
  return api.patch(`/documents/surveys/${id}/`, data);
};

export const deleteSurvey = (id, password) => {
  return api.delete(`/documents/surveys/${id}/`, { data: { password } });
};

// questions: [{ order, text, question_type, options? }, ...]
//   question_type: 'rating' | 'likert' | 'single' | 'multiple' | 'text'
//   options: ['Label A', 'Label B', ...]  (only for likert/single/multiple)
export const saveSurveyQuestions = (surveyId, questions) => {
  return api.put(`/documents/surveys/${surveyId}/questions/`, { questions });
};

export const fetchSurveyAnalytics = () => {
  return api.get('/documents/surveys/analytics/');
};

// Full per-question aggregation for one survey — powers AdminSurveyAnalytics
// (bar charts per choice question, rating distribution pie, CSAT, comments).
export const fetchSurveyDetailedAnalytics = (surveyId) => {
  return api.get(`/documents/surveys/${surveyId}/analytics/`);
};

// --- Public landing-page survey (no account, no document needed) ---

export const fetchPublicSurvey = () => api.get('/documents/surveys/public/');

// answers: [{ question, rating_value? , text_value? , selected_option_ids? }, ...]
export const submitPublicSurvey = (answers) => {
  return api.post('/documents/surveys/public/', { answers });
};

// --- Post-scan citizen survey (shown after a citizen scans their own QR) ---

export const fetchPostScanSurvey = (documentId) => {
  return api.get(`/documents/${documentId}/post-scan-survey/`);
};

// answers: [{ question, rating_value? , text_value? , selected_option_ids? }, ...]
export const submitPostScanSurvey = (documentId, answers) => {
  return api.post(`/documents/${documentId}/post-scan-survey/`, { answers });
};

// --- Municipal Suggestion Box ---

// Logged-in citizen: their own suggestions + filing a new one.
export const fetchMySuggestions = () => api.get('/documents/suggestions/');
export const createSuggestion = (data) => api.post('/documents/suggestions/', data);

// Admin review dashboard. params: { status?, category?, page? }
export const fetchAdminSuggestions = (params = {}) => {
  return api.get('/documents/suggestions/admin/', { params });
};

// data: { status?, admin_notes? }
export const updateSuggestion = (id, data) => {
  return api.patch(`/documents/suggestions/admin/${id}/`, data);
};

// Admin-only, anonymized citizen comments feed — powers CitizenCommentsWidget.
export const fetchSurveyComments = () => {
  return api.get('/documents/surveys/comments/');
};

// Staff/employee equivalent, scoped to the logged-in user's own office —
// same anonymization guarantees, powers CitizenCommentsWidget on the
// employee Dashboard.
export const fetchMyOfficeComments = () => {
  return api.get('/documents/my-office-comments/');
};


export default api;