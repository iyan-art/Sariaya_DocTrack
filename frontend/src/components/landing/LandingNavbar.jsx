import { useState, useEffect } from 'react';
import { MenuIcon } from '../Icons';

const NAV_LINKS = [
  { label: 'Home', href: '#hero' },
  { label: 'Citizen Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'History', href: '#history' },
  { label: 'Events', href: '#events' },
  { label: 'News', href: '#announcements' },
  { label: 'Discover', href: '#discover' },
  { label: 'Municipal Info', href: '#municipal-info' },
  { label: 'Contact', href: '#contact' },
];

// Smooth-scrolls to an in-page section by id — every nav link, and every
// "Request a Document" / "Track My Document" CTA throughout the redesigned
// page, goes through this rather than a route change, since this is all
// still one Landing page.
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Fixed header for the redesigned public Landing page. Transparent over the
 * hero video at the top of the page; gains a solid white background + shadow
 * once the visitor scrolls past the hero, so nav text stays readable against
 * whatever's playing behind it without needing per-frame contrast tuning.
 */
export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = (href) => {
    setMobileOpen(false);
    scrollToSection(href.slice(1));
  };

  const textColor = scrolled ? 'text-slate-700' : 'text-white';

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-colors duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-16 sm:h-20 flex items-center justify-between">
        <button onClick={() => handleNavClick('#hero')} className="flex items-center gap-3 shrink-0">
          <img
            src="/sariaya-logo.jpg"
            alt="Municipality of Sariaya Official Seal"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover shrink-0 bg-white"
          />
          <div className="leading-tight text-left">
            <p className={`font-bold text-base sm:text-lg ${textColor}`}>Municipality of Sariaya</p>
            <p className={`text-[11px] hidden sm:block ${scrolled ? 'text-slate-500' : 'text-white/80'}`}>
              Quezon, Philippines
            </p>
          </div>
        </button>

        <nav className="hidden xl:flex items-center gap-5">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className={`text-sm font-semibold hover:text-blue-500 transition-colors ${textColor}`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden xl:block">
          <button
            onClick={() => handleNavClick('#access')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg px-5 py-2.5 transition-colors shadow-lg shadow-blue-600/20"
          >
            Log In / Sign In
          </button>
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          className={`xl:hidden p-2 rounded-lg ${textColor}`}
        >
          <MenuIcon className="w-6 h-6" />
        </button>
      </div>

      {mobileOpen && (
        <div className="xl:hidden bg-white border-t border-slate-100 shadow-lg px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('#access')}
            className="block w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg px-4 py-3 text-center transition-colors"
          >
            Log In / Sign In
          </button>
        </div>
      )}
    </header>
  );
}

export { scrollToSection };
