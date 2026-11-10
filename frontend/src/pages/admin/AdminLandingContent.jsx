import { useCallback, useEffect, useState } from 'react';
import { deleteManagedContent, fetchManagedContent, mediaUrl, saveManagedContent } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ConfirmModal';
import LandingContentForm from '../../components/admin/LandingContentForm';
import { CalendarIcon, MapPinIcon, NewspaperIcon } from '../../components/Icons';

const TABS = [
  { key: 'news', label: 'News & Announcements', icon: NewspaperIcon },
  { key: 'events', label: 'Events', icon: CalendarIcon },
];

const STATUS = {
  published: { label: 'On landing page', className: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30' },
  ongoing: { label: 'Happening now', className: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30' },
  upcoming: { label: 'Upcoming', className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
  past: { label: 'Past', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  archived: { label: 'Archived', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
};

function formatDate(value, withTime = false) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric', ...(withTime && { hour: 'numeric', minute: '2-digit' }) };
  return new Date(withTime ? value : `${value}T00:00:00`).toLocaleString(undefined, opts);
}

function itemDate(kind, item) {
  if (kind === 'news') return formatDate(item.published_at, true);
  const start = formatDate(item.start_date);
  return item.end_date && item.end_date !== item.start_date ? `${start} – ${formatDate(item.end_date)}` : start;
}

/**
 * Admin page for what the public landing page shows: news/announcements
 * and municipal events. Posting, editing, archiving (hidden from the
 * landing page, kept here) and deleting.
 */
export default function AdminLandingContent() {
  const { showToast } = useToast();
  const [kind, setKind] = useState('news');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(undefined); // undefined: closed, null: new, object: edit
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => (
    fetchManagedContent(kind)
      .then((res) => setItems(res.data))
      .catch(() => showToast('Failed to load items.', 'error'))
      .finally(() => setLoading(false))
  ), [kind, showToast]);

  useEffect(() => { load(); }, [load]);

  const switchKind = (next) => {
    if (next === kind) return;
    setLoading(true);
    setItems([]);
    setKind(next);
  };

  const toggleArchive = async (item) => {
    const data = new FormData();
    data.append('is_active', item.is_active ? 'false' : 'true');
    try {
      await saveManagedContent(kind, item.id, data);
      showToast(item.is_active ? `"${item.title}" archived.` : `"${item.title}" restored.`, 'success');
      load();
    } catch {
      showToast('Failed to update this item.', 'error');
    }
  };

  const confirmDelete = async () => {
    const item = deleting;
    setDeleting(null);
    try {
      await deleteManagedContent(kind, item.id);
      showToast(`"${item.title}" deleted.`, 'success');
      load();
    } catch {
      showToast('Failed to delete this item.', 'error');
    }
  };

  const Placeholder = kind === 'news' ? NewspaperIcon : CalendarIcon;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
            <NewspaperIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">News &amp; Events</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">What the public landing page shows. Post new items each month to keep it current.</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all"
        >
          + {kind === 'news' ? 'New Announcement' : 'New Event'}
        </button>
      </div>

      <div role="tablist" aria-label="Content type" className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={kind === key}
            onClick={() => switchKind(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              kind === key ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-10 text-slate-400 dark:text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 font-bold">
            {kind === 'news' ? 'No announcements yet — post the first one.' : 'No events yet — post the first one.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const status = STATUS[item.status] || STATUS.archived;
            return (
              <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm ${item.is_active ? '' : 'opacity-75'}`}>
                {item.image ? (
                  <img src={mediaUrl(item.image)} alt="" loading="lazy" className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    <Placeholder className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight break-words min-w-0">{item.title}</h3>
                    <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{itemDate(kind, item)}</p>
                  {kind === 'events' && item.location && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> {item.location}</p>
                  )}
                  {(item.summary || item.description) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{item.summary || item.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 text-xs font-bold">
                    <button onClick={() => setEditing(item)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Edit</button>
                    <button onClick={() => toggleArchive(item)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">
                      {item.is_active ? 'Archive' : 'Restore'}
                    </button>
                    <button onClick={() => setDeleting(item)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing !== undefined && (
        <LandingContentForm
          key={`${kind}-${editing?.id ?? 'new'}`}
          kind={kind}
          item={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete permanently?"
          message={`"${deleting.title}" and its picture will be deleted. To only hide it from the landing page, archive it instead.`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
