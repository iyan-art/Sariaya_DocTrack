import { useEffect, useMemo } from 'react';

// Mirrors apps/documents/images.py, which re-checks and resizes every upload.
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const IMAGE_TYPES = IMAGE_ACCEPT.split(',');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageFileError(file) {
  if (!file) return null;
  if (!IMAGE_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP picture.';
  if (file.size > MAX_IMAGE_BYTES) return 'Pictures must be 5 MB or smaller.';
  return null;
}

// A preview URL for a chosen file, released when the file changes or the
// component unmounts.
export function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}
