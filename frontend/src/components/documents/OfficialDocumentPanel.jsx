import { useState, useEffect, useRef } from 'react';
import { fetchOfficialDocumentFile } from '../../api/axios';
import { PrinterIcon } from '../Icons';

/**
 * Renders the REAL official document file (a stored PDF — Birth/Marriage/
 * Death Certificate, Business/Building Permit) for an authenticated viewer
 * (staff previewing anytime, or the citizen who owns a Released document).
 * Fetched as a blob (not a plain <iframe src="/api/...">) because the
 * endpoint is behind the JWT Authorization header — axios attaches it,
 * a bare URL wouldn't. Public/guest viewing uses a direct <iframe> to the
 * unauthenticated public-track endpoint instead (see PublicTrack.jsx).
 */
export default function OfficialDocumentPanel({ documentId }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [fileUrl, setFileUrl] = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    let objectUrl = null;
    setStatus('loading');

    fetchOfficialDocumentFile(documentId)
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data);
        setFileUrl(objectUrl);
        setStatus('ready');
      })
      .catch(async (err) => {
        let message = 'This document\'s official file isn\'t available right now.';
        // err.response.data is a Blob here (responseType: 'blob'), so the
        // server's JSON error body has to be read back out of it.
        if (err.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const parsed = JSON.parse(text);
            if (parsed.detail) message = parsed.detail;
          } catch {
            // fall through to the generic message
          }
        }
        setErrorMessage(message);
        setStatus('error');
      });

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const handleDownload = () => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = 'official-document.pdf';
    a.click();
  };

  if (status === 'loading') {
    return <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">Loading official document…</p>;
  }

  if (status === 'error') {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-6 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="doc-view-no-print flex justify-end gap-2 mb-3">
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-3 py-2 rounded-lg transition-colors"
        >
          <PrinterIcon className="w-3.5 h-3.5" /> Print
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
        >
          Download
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={fileUrl}
        title="Official Document"
        className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-700"
      />
    </div>
  );
}
