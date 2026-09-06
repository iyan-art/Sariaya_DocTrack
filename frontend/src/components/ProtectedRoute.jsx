import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();
  const { showToast } = useToast();

  const wrongRole = !loading && !!user && allowedRoles && !allowedRoles.includes(user.role);

  // Side effect (toast), not part of render — fires once when a logged-in
  // user with the wrong role hits a route they're not allowed on, right
  // before they get bounced back to their own dashboard below.
  useEffect(() => {
    if (wrongRole) {
      showToast('Unauthorized access — redirected to your dashboard.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongRole]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (wrongRole) {
    // Logged in, but wrong role for this route — send them to their own dashboard
    const home = { admin: '/admin/dashboard', employee: '/employee/dashboard', citizen: '/citizen/home' };
    return <Navigate to={home[user.role] || '/login'} replace />;
  }

  return <Outlet />;
}