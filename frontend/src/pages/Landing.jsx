import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import LandingNavbar, { scrollToSection } from '../components/landing/LandingNavbar';
import HeroSection from '../components/landing/HeroSection';
import QuickActionsSection from '../components/landing/QuickActionsSection';
import ServicesSection from '../components/landing/ServicesSection';
import AboutSection from '../components/landing/AboutSection';
import HistorySection from '../components/landing/HistorySection';
import EventsSection from '../components/landing/EventsSection';
import AnnouncementsSection from '../components/landing/AnnouncementsSection';
import DiscoverSection from '../components/landing/DiscoverSection';
import MunicipalInfoSection from '../components/landing/MunicipalInfoSection';
import ContactSection from '../components/landing/ContactSection';
import LandingFooter from '../components/landing/LandingFooter';
import ScrollToTopButton from '../components/ScrollToTopButton';

/**
 * Public Landing page — the Municipality of Sariaya's digital front door,
 * telling the Sariaya DocTrack story top to bottom: hero -> quick actions
 * (track / feedback / sign in) -> citizen services -> municipal
 * information sections -> contact -> footer. Login/Register itself lives
 * inside QuickActionsSection, unchanged from before this redesign; every
 * other section here is presentational, built around real system data
 * where it exists (document types, offices, announcements, events).
 */
export default function Landing() {
  const { pathname, hash } = useLocation();

  // /login (after signing out, an expired session, or "Log in" elsewhere) and
  // #access / #track links land on the sign-in and tracking section instead
  // of the top of the page.
  useEffect(() => {
    const target = pathname === '/login' ? 'access' : (hash === '#access' || hash === '#track' ? hash.slice(1) : null);
    if (!target) return undefined;
    const timer = setTimeout(() => scrollToSection(target), 150);
    return () => clearTimeout(timer);
  }, [pathname, hash]);

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <HeroSection />
      <QuickActionsSection />
      <ServicesSection />
      <AboutSection />
      <HistorySection />
      <EventsSection />
      <AnnouncementsSection />
      <DiscoverSection />
      <MunicipalInfoSection />
      <ContactSection />
      <LandingFooter />
      <ScrollToTopButton />
    </div>
  );
}
