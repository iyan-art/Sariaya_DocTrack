import { useState } from 'react';
import { mediaUrl } from '../api/axios';

/**
 * A user's profile picture, or their initials when they haven't uploaded
 * one (or it fails to load). Decorative by default, since the name is
 * shown beside it; pass `alt` where the picture stands on its own.
 */
export default function UserAvatar({ user, className = 'h-9 w-9 text-sm', alt = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = user?.avatar ? mediaUrl(user.avatar) : null;
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || '?';

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setFailedSrc(src)}
        className={`${className} shrink-0 rounded-full object-cover bg-slate-200 dark:bg-slate-700`}
      />
    );
  }
  return (
    <div
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`${className} shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold text-slate-600 dark:text-slate-200`}
    >
      {initials}
    </div>
  );
}
