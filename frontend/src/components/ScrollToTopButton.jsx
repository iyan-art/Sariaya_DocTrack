import { useState, useEffect } from 'react';
import { ArrowUpIcon } from './Icons';

const SHOW_AFTER_PX = 300;

/**
 * Floating "back to top" button — appears bottom-right once the page has
 * scrolled past SHOW_AFTER_PX, smooth-scrolls back to the top on click.
 * Mounted once per layout (DashboardLayout, Landing) rather than per-page.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll(); // in case the page loads already scrolled (e.g. a hash link)
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      title="Scroll to top"
      className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center transition-all hover:-translate-y-0.5"
    >
      <ArrowUpIcon className="w-5 h-5" />
    </button>
  );
}
