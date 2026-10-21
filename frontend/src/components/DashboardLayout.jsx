import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import ScrollToTopButton from './ScrollToTopButton';
import {
  ArrowRightLeftIcon,
  BarChart3Icon,
  BellIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  Clock3Icon,
  FileTextIcon,
  HandshakeIcon,
  HomeIcon,
  LayoutGridIcon,
  LogOutIcon,
  MapPinIcon,
  MenuIcon,
  MoonIcon,
  ScanLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarIcon,
  SunIcon,
  UserCircleIcon,
  UsersIcon,
} from './Icons';

const MENUS = {
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutGridIcon },
    { label: 'Heatmap', path: '/admin/heatmap', icon: BarChart3Icon },
    { label: 'Document Request', path: '/admin/document-request', icon: FileTextIcon },
    { label: 'Document Types', path: '/admin/document-types', icon: ClipboardListIcon },
    { label: 'Offices', path: '/admin/offices', icon: MapPinIcon },
    { label: 'Workflow Builder', path: '/admin/workflow-builder', icon: ArrowRightLeftIcon },
    {
      label: 'User Management', icon: UsersIcon,
      children: [
        { label: 'Users', path: '/admin/users' },
        { label: 'Officials', path: '/admin/officials' },
        { label: 'Archive', path: '/admin/archive' },
      ],
    },
    { label: 'Access Logs', path: '/admin/access-logs', icon: ShieldCheckIcon },
    { label: 'Surveys', path: '/admin/surveys', icon: StarIcon },
    { label: 'Suggestion Box', path: '/admin/suggestions', icon: HandshakeIcon },
    { label: 'QR Code Scan', path: '/admin/qr-scan', icon: ScanLineIcon },
  ],
  employee: [
    { label: 'Dashboard', path: '/employee/dashboard', icon: LayoutGridIcon },
    { label: 'Documents', path: '/employee/documents', icon: FileTextIcon },
    { label: 'QR Code Scan', path: '/employee/qr-scan', icon: ScanLineIcon },
  ],
  citizen: [
    { label: 'Home', path: '/citizen/home', icon: HomeIcon },
    { label: 'History', path: '/citizen/history', icon: Clock3Icon },
    { label: 'Scan Document', path: '/citizen/scan', icon: ScanLineIcon },
    { label: 'Suggestion Box', path: '/citizen/suggestions', icon: HandshakeIcon },
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile toggle
  const [openSubmenu, setOpenSubmenu] = useState(null);

  const menu = MENUS[user.role] || [];

  // logout() itself now clears storage and navigates to "/" — see
  // AuthContext.jsx — so there's nothing left for this handler to do beyond
  // calling it. (A second navigate() call here would just race it.)
  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">

      {/* Mobile overlay when sidebar open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static z-30 inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        {/* Logo */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-100 dark:border-slate-800">
          {/* Swap this for the Sariaya seal: <img src="/seal.png" className="h-10 w-10" /> */}
          <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            S
          </div>
          <div className="leading-tight">
            <p className="font-bold text-slate-900 dark:text-white text-sm">QR-Track</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Sariaya LGU</p>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {menu.map((item) =>
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => setOpenSubmenu(openSubmenu === item.label ? null : item.label)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  <span className={`text-xs transition-transform ${openSubmenu === item.label ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon className="w-4 h-4" />
                  </span>
                </button>
                {openSubmenu === item.label && (
                  <div className="ml-9 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* TOPBAR */}
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <MenuIcon className="w-6 h-6" />
          </button>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-5">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            {/* NotificationBell (the general in-app inbox — incoming/returned
                documents, expedite requests, bottleneck/feedback alerts) shows for
                both Admin and Employee. The separate SLA-email activity log
                (EmailNotificationBell) was removed from the admin header per
                request — still exists as a component if it's ever wanted back,
                just not rendered anywhere now. Citizen keeps the plain,
                decorative bell (nothing wired up for that role yet). */}
            {(user.role === 'admin' || user.role === 'employee') ? (
              <NotificationBell />
            ) : (
              <button className="relative text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <BellIcon className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2"
              >
                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-200">
                  {user.first_name?.[0]}{user.last_name?.[0]}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-tight">{user.full_name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 capitalize leading-tight">{user.role}</p>
                </div>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 py-2 z-20">
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user.full_name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{user.email}</p>
                    </div>
                    <button
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                    <UserCircleIcon className="w-4 h-4" /> Profile
                    </button>
                    <button
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                    <SettingsIcon className="w-4 h-4" /> Settings
                    </button>
                    <div className="border-t border-slate-100 dark:border-slate-700 mt-1">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                        <LogOutIcon className="w-4 h-4" /> Sign out
                    </button>
                    </div>
                </div>
                )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>

      <ScrollToTopButton />
    </div>
  );
}