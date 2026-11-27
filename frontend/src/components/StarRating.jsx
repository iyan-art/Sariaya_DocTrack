import { useState } from 'react';
import { StarIcon } from './Icons';

const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** One star filled to `fill` (0, 0.5 or 1). */
function Star({ fill, className }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <StarIcon className="absolute inset-0 w-full h-full" />
      {fill > 0 && (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <StarIcon className={`${className} max-w-none`} filled />
        </span>
      )}
    </span>
  );
}

const fillFor = (star, value) => Math.max(0, Math.min(1, value - (star - 1)));

/** Read-only stars, halves included (e.g. 3.5). */
export function StarRow({ value, className = 'w-3.5 h-3.5' }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-400" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={className} fill={fillFor(n, Number(value) || 0)} />)}
    </span>
  );
}

/**
 * Star rating input with half stars: the left half of a star gives x.5,
 * the right half the whole star. Hover previews; arrow keys move by half a
 * star, Home/End jump to the ends.
 */
export default function StarRatingInput({ value, onChange, size = 'w-8 h-8' }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  const valueAt = (event, star) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX - box.left < box.width / 2 ? star - 0.5 : star;
  };

  const handleKeyDown = (event) => {
    setHover(0); // the keyboard's value shows, not a stale mouse preview
    const index = STEPS.indexOf(value || 0);
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(STEPS[Math.min(STEPS.length - 1, index + 1)]);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(STEPS[Math.max(0, index - 1)]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(STEPS[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(5);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Rating"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value || 0}
        aria-valuetext={value ? `${value} out of 5 stars` : 'Not rated'}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHover(0)}
        className="inline-flex gap-1 text-amber-400 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            onMouseMove={(event) => setHover(valueAt(event, star))}
            onClick={(event) => onChange(valueAt(event, star))}
            className="cursor-pointer hover:scale-110 transition-transform"
          >
            <Star className={size} fill={fillFor(star, shown)} />
          </span>
        ))}
      </div>
      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums min-w-[3.5rem]">
        {shown ? `${shown} / 5` : ''}
      </span>
    </div>
  );
}
