import { useEffect, useRef, useState } from 'react';
import { scrollToSection } from './LandingNavbar';

// Drop real files at these exact paths in frontend/public/ to activate the
// video hero — nothing else needs to change. Vite serves anything under
// public/ at the site root, so /hero-video.mp4 and /hero-poster.jpg just
// need to exist on disk. Until then, onVideoError below falls back to a
// plain static gradient so the hero never looks broken.
const HERO_VIDEO_URL = '/hero-video.mp4';
const HERO_POSTER_URL = '/hero-poster.jpg';

export default function HeroSection() {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // autoPlay handles the common case, but some browsers' autoplay policies
  // still silently block playback without firing the <video> element's own
  // error event — this call's rejection is the only reliable signal for
  // that, and is what actually triggers the poster-image fallback the
  // brief requires for "video can't autoplay" rather than just a frozen
  // first frame.
  useEffect(() => {
    if (reducedMotion || videoFailed || !videoRef.current) return;
    videoRef.current.play?.().catch(() => setVideoFailed(true));
  }, [reducedMotion, videoFailed]);

  // Reduced motion, no video file present yet, or autoplay blocked by the
  // browser: show the still poster image instead. If the poster is also
  // missing, the plain gradient below is the final, always-present
  // fallback — the hero never renders blank.
  const showVideo = !reducedMotion && !videoFailed;

  return (
    <section id="hero" className="relative h-[100svh] min-h-[560px] w-full overflow-hidden bg-slate-900">
      {/* Static fallback background — always present underneath, so a
          missing/failed video or poster never leaves a blank white hero. */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />

      {!showVideo && !posterFailed && (
        <img
          src={HERO_POSTER_URL}
          alt=""
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          src={HERO_VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
        />
      )}

      {/* Dark overlay for text readability against any frame of the video. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

      <div className="relative z-10 h-full flex items-center">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 w-full">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-white/90 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 backdrop-blur-sm">
              Municipality of Sariaya, Quezon
            </span>
            <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
              Sariaya DocTrack
            </h1>
            <p className="mt-3 text-lg sm:text-xl font-medium text-white/85">
              Your Digital Gateway to Municipal Documents and Services
            </p>
            <p className="mt-5 text-base sm:text-lg text-white/80 leading-relaxed max-w-xl">
              Sariaya DocTrack is the Municipality of Sariaya's digital platform for requesting, processing,
              and tracking municipal documents and services. Access government services more conveniently,
              monitor your document status, and stay informed through one centralized online system.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                onClick={() => scrollToSection('access')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-6 py-3.5 transition-colors shadow-lg shadow-blue-600/30"
              >
                Log In / Sign In
              </button>
              <button
                onClick={() => scrollToSection('track')}
                className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold rounded-xl px-6 py-3.5 backdrop-blur-sm transition-colors"
              >
                Track My Document
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => scrollToSection('about')}
        aria-label="Scroll to About Sariaya"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-white/70 hover:text-white transition-colors animate-bounce"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </button>
    </section>
  );
}
