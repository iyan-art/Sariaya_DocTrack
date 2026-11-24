"""
In-process background scheduler for the SLA/overdue scans (sla_scan.py).
Runs as a daemon thread inside the web server process, both under the dev
`runserver` and under gunicorn in production, so overdue alert emails go
out with no extra service to set up. Turn it off with
SLA_SCHEDULER_ENABLED=false.

Each gunicorn worker starts its own thread, but run_scheduled_scans()
claims the run in the database first, so the scans still run once per
interval, not once per worker.

A host that puts the server to sleep when idle (Render's free plan) stops
this thread too. For that case an external cron service can call
POST /api/documents/sla-scan/cron/ (see SlaScanCronView), which wakes the
server and runs the same scans.
"""
import logging
import threading

from django.conf import settings

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def _run_forever():
    from django.db import close_old_connections

    from .sla_scan import run_scheduled_scans

    interval = settings.SLA_SCAN_INTERVAL_SECONDS
    stop_event = threading.Event()
    # A short initial delay gives the server a moment to finish starting
    # up; after that, one pass every `interval` seconds.
    wait_seconds = 10
    while True:
        stop_event.wait(wait_seconds)
        try:
            close_old_connections()
            # Slightly under the interval, so normal timer drift never skips a run.
            result = run_scheduled_scans(min_interval_seconds=interval * 0.9)
            if result:
                overdue, alerts = result['overdue'], result['overdue_alerts']
                logger.info(
                    "SLA scan: %s document(s) overdue (%s email(s) sent), %s approaching due date "
                    "(%s email(s) sent); %s document(s) past the 48h overdue ceiling (%s new alert(s)).",
                    overdue['documents_overdue'], overdue['emails_sent'],
                    overdue['documents_due_soon'], overdue['due_soon_emails_sent'],
                    alerts['total_stuck'], alerts['alerts_created'],
                )
        except Exception:
            # A single bad scan (e.g. transient DB hiccup) should never kill
            # the background thread — it just tries again next interval.
            logger.exception("Scheduled SLA scan failed")
        finally:
            close_old_connections()
        wait_seconds = interval


def start():
    """
    Launches the SLA/email background scanner exactly once per server
    process, as a daemon thread so it never blocks process shutdown. Called
    from DocumentsConfig.ready(), which gates this to a process that serves
    traffic (runserver's reloaded child, or a gunicorn worker), never
    migrate/shell/tests.
    """
    global _started
    with _lock:
        if _started:
            return
        _started = True
    thread = threading.Thread(target=_run_forever, name='sla-email-scheduler', daemon=True)
    thread.start()
    logger.info("SLA/email background scheduler started (interval: %ss).",
                settings.SLA_SCAN_INTERVAL_SECONDS)
