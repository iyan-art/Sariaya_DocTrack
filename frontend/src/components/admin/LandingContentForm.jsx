import { useRef, useState } from 'react';
import { mediaUrl, saveManagedContent } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { IMAGE_ACCEPT, imageFileError, useObjectUrl } from '../../utils/imageUpload';
import { CameraIcon, TrashIcon } from '../Icons';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const errorClass = 'text-xs text-red-600 dark:text-red-400 mt-1';

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialForm(kind, item) {
  if (kind === 'news') {
    return {
      title: item?.title || '', summary: item?.summary || '', body: item?.body || '',
      published_at: toLocalInput(item?.published_at),
    };
  }
  return {
    title: item?.title || '', description: item?.description || '', location: item?.location || '',
    start_date: item?.start_date || '', end_date: item?.end_date || '',
  };
}

/**
 * Create or edit one landing-page item: a news post/announcement
 * (kind="news") or an event (kind="events"), with an optional picture that
 * is previewed before saving. Archiving and deleting live on the list page.
 */
export default function LandingContentForm({ kind, item, onClose, onSaved }) {
  const { showToast } = useToast();
  const fileInput = useRef(null);
  const [form, setForm] = useState(() => initialForm(kind, item));
  const [file, setFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const preview = useObjectUrl(file);
  const isNews = kind === 'news';
  const shownImage = preview || (!removeImage && item?.image ? mediaUrl(item.image) : null);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const pickFile = (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    const problem = imageFileError(chosen);
    setErrors((er) => ({ ...er, image: problem }));
    if (!problem) {
      setFile(chosen);
      setRemoveImage(false);
    }
  };

  const clearImage = () => {
    setFile(null);
    setRemoveImage(Boolean(item?.image));
    setErrors((er) => ({ ...er, image: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setErrors({ title: 'Please enter a title.' });
      return;
    }
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'published_at') data.append(key, new Date(value).toISOString());
      else data.append(key, value);
    });
    if (file) data.append('image', file);
    else if (removeImage) data.append('remove_image', 'true');

    setSaving(true);
    setErrors({});
    try {
      await saveManagedContent(kind, item?.id, data);
      showToast(item ? 'Changes saved.' : (isNews ? 'Announcement posted.' : 'Event posted.'), 'success');
      onSaved();
    } catch (err) {
      const fieldErrors = err?.response?.data;
      if (fieldErrors && typeof fieldErrors === 'object' && !Array.isArray(fieldErrors)) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      }
      showToast(extractErrorMessage(err, "We couldn't save this item."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="landing-form-title" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-xl max-h-[90vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="landing-form-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {item ? 'Edit' : 'New'} {isNews ? 'announcement' : 'event'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          <div>
            <span className={labelClass}>Picture <span className="text-slate-400 font-normal">(optional)</span></span>
            <div className="mt-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 overflow-hidden">
              {shownImage ? (
                <img src={shownImage} alt="Selected picture preview" className="w-full h-44 object-cover" />
              ) : (
                <div className="h-32 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No picture</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-3 py-2 rounded-lg">
                <CameraIcon className="w-3.5 h-3.5" /> {shownImage ? 'Change picture' : 'Choose picture'}
              </button>
              {shownImage && (
                <button type="button" onClick={clearImage} className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-3 py-2 rounded-lg">
                  <TrashIcon className="w-3.5 h-3.5" /> Remove picture
                </button>
              )}
              <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} onChange={pickFile} className="hidden" aria-label="Picture file" />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">JPEG, PNG or WebP, up to 5 MB. Large pictures are resized automatically.</p>
            {errors.image && <p role="alert" className={errorClass}>{errors.image}</p>}
          </div>

          <div>
            <label className={labelClass} htmlFor="lc-title">Title <span className="text-red-500">*</span></label>
            <input id="lc-title" name="title" required maxLength={200} value={form.title} onChange={update} className={inputClass} />
            {errors.title && <p className={errorClass}>{errors.title}</p>}
          </div>

          {isNews ? (
            <>
              <div>
                <label className={labelClass} htmlFor="lc-summary">Summary <span className="text-slate-400 font-normal">(shown on the card)</span></label>
                <input id="lc-summary" name="summary" maxLength={300} value={form.summary} onChange={update} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="lc-body">Full announcement</label>
                <textarea id="lc-body" name="body" rows={6} value={form.body} onChange={update} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="lc-published">Publish on</label>
                <input id="lc-published" name="published_at" type="datetime-local" required value={form.published_at} onChange={update} className={inputClass} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Set a future date to schedule it; it appears on the landing page then.</p>
                {errors.published_at && <p className={errorClass}>{errors.published_at}</p>}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="lc-start">Event date <span className="text-red-500">*</span></label>
                  <input id="lc-start" name="start_date" type="date" required value={form.start_date} onChange={update} className={inputClass} />
                  {errors.start_date && <p className={errorClass}>{errors.start_date}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="lc-end">Ends <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input id="lc-end" name="end_date" type="date" min={form.start_date || undefined} value={form.end_date} onChange={update} className={inputClass} />
                  {errors.end_date && <p className={errorClass}>{errors.end_date}</p>}
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="lc-location">Location</label>
                <input id="lc-location" name="location" maxLength={200} value={form.location} onChange={update} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="lc-description">Description</label>
                <textarea id="lc-description" name="description" rows={5} value={form.description} onChange={update} className={inputClass} />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors">
              {saving ? 'Saving…' : item ? 'Save changes' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
