import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { registerServiceWorker } from './serviceWorkerRegistration';
import Landing from './pages/Landing';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Users from './pages/admin/Users';
import Archive from './pages/admin/Archive';
import Officials from './pages/admin/Officials';
import DocumentRequest from './pages/admin/DocumentRequest';
import QRScan from './pages/admin/QRScan';
import AdminWorkflowBuilder from './pages/admin/AdminWorkflowBuilder';
import AdminDocumentTypeManager from './pages/admin/AdminDocumentTypeManager';
import AdminOfficeManager from './pages/admin/AdminOfficeManager';
import OfficeDocuments from './pages/employee/OfficeDocuments';
import EmployeeDashboard from './pages/employee/Dashboard';
import PublicTrack from './pages/PublicTrack';
import AdminDashboard from './pages/admin/AdminDashboard';
import Heatmap from './pages/admin/Heatmap';
import AdminAccessLogs from './pages/admin/AdminAccessLogs';
import AdminSurveys from './pages/admin/AdminSurveys';
import AdminSuggestions from './pages/admin/AdminSuggestions';
import CitizenHistory from './pages/citizen/History';
import CitizenHome from './pages/citizen/Home';
import CitizenScanDocument from './pages/citizen/ScanDocument';
import CitizenSuggestionBox from './pages/citizen/SuggestionBox';


function App() {
  // PWA setup: registers public/sw.js for offline app-shell caching (see
  // src/serviceWorkerRegistration.js — a no-op outside production builds).
  // InstallPWAButton.jsx is what actually surfaces the install prompt this
  // enables; this call just needs to happen once, on app bootstrap.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Landing />} />
      <Route path="/track/:trackingNumber" element={<PublicTrack />} />

      {/* ADMIN */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/heatmap" element={<Heatmap />} /> 
          
          <Route path="/admin/document-request" element={<DocumentRequest />} />
          <Route path="/admin/document-types" element={<AdminDocumentTypeManager />} />
          <Route path="/admin/offices" element={<AdminOfficeManager />} />
          <Route path="/admin/workflow-builder" element={<AdminWorkflowBuilder />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/officials" element={<Officials />} />
          <Route path="/admin/archive" element={<Archive />} />
          <Route path="/admin/access-logs" element={<AdminAccessLogs />} />
          <Route path="/admin/surveys" element={<AdminSurveys />} />
          <Route path="/admin/suggestions" element={<AdminSuggestions />} />
          <Route path="/admin/qr-scan" element={<QRScan />} />
        </Route>
      </Route>

      {/* EMPLOYEE */}
      <Route element={<ProtectedRoute allowedRoles={['employee']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
           <Route path="/employee/documents" element={<OfficeDocuments />} />
          <Route path="/employee/qr-scan" element={<QRScan />} />
        </Route>
      </Route>

      {/* CITIZEN */}
      <Route element={<ProtectedRoute allowedRoles={['citizen']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/citizen/home" element={<CitizenHome />} />
          <Route path="/citizen/history" element={<CitizenHistory />} />
          <Route path="/citizen/scan" element={<CitizenScanDocument />} />
          <Route path="/citizen/suggestions" element={<CitizenSuggestionBox />} />
        </Route>
      </Route>

      {/* Any URL that isn't one of the routes above (typo, stale bookmark,
          a path from an old plan that never became a real page, etc.) —
          send it home instead of silently rendering a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;