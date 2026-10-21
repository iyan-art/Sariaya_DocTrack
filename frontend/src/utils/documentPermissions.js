// Mirrors services.py::can_delete_document — admins can override at any
// stage; everyone else (staff or the citizen owner) can only delete/cancel
// a request while it's still sitting untouched at its origin office. The
// server re-checks this regardless; this is just so the delete/cancel
// button isn't offered somewhere it would obviously be rejected.
export function canDeleteDocument(doc, user) {
  if (user?.role === 'admin') return true;
  return doc.status === 'in_progress' && doc.route_position === 0;
}
