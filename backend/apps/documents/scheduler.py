"""
In-process background scheduler for the SLA/email scans (sla_scan.py). Runs
inside the same `runserver` process as a daemon thread, so the "automated
email notification system" actually runs on its own on a dev machine —
without the user having to separately configure Windows Task Scheduler/cron
(check_overdue_documents / check_missing_documents remain available as
management commands for that route in a real production deployment, see
their docstrings).

Not meant to run under multiple worker processes (e.g. several gunicorn
workers) at once — each worker would start its own copy of this thread and
the scans would fire redundantly. That's a non-issue for this project's
single-process `runserver` dev/demo setup; a real multi-worker production
deployment should switch to the OS-level scheduler + management commands
instead and leave SLA_SCAN_INTERVAL_SECONDS unset/irrelevant.
"""
import logging
import threading

from django.conf import settings

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def _run_forever():
    from .sla_scan import run_overdue_scan, run_missing_scan

    interval = getattr(settings, 'SLA_SCAN_INTERVAL_SECONDS', 900)
    stop_event = threading.Event()
    # A short initial delay (rather than firing instantly) gives the server
    # process a moment to finish starting up before the first scan runs;
    # after that, one scan fires every `interval` seconds indefinitely.
    wait_seconds = 10
    while True:
        stop_event.wait(wait_seconds)
        try:
            overdue_result = run_overdue_scan()
            missing_result = run_missing_scan()
            logger.info(
                "SLA scan: %s document(s) overdue (%s email(s) sent), %s approaching due date "
                "(%s email(s) sent); %s document(s) past the 48h missing threshold (%s new alert(s)).",
                overdue_result['documents_overdue'], overdue_result['emails_sent'],
                overdue_result['documents_due_soon'], overdue_result['due_soon_emails_sent'],
                missing_result['total_stuck'], missing_result['alerts_created'],
            )
        except Exception:
            # A single bad scan (e.g. transient DB hiccup) should never kill
            # the background thread — it just tries again next interval.
            logger.exception("Scheduled SLA scan failed")
        wait_seconds = interval


def start():
    """
    Launches the SLA/email background scanner exactly once per server
    process, as a daemon thread so it never blocks process shutdown. Called
    from DocumentsConfig.ready(), which gates this to the real `runserver`
    process only (not migrate/shell/tests/etc., and not the autoreloader's
    parent watcher process).
    """
    global _started
    with _lock:
        if _started:
            return
        _started = True
    thread = threading.Thread(target=_run_forever, name='sla-email-scheduler', daemon=True)
    thread.start()
    logger.info("SLA/email background scheduler started (interval: %ss).",
                getattr(settings, 'SLA_SCAN_INTERVAL_SECONDS', 900))
