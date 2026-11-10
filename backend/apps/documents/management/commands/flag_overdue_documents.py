from django.core.management.base import BaseCommand

from apps.documents.sla_scan import DEFAULT_OVERDUE_ALERT_HOURS, run_overdue_alert_scan


class Command(BaseCommand):
    help = (
        "Flags as Overdue any document In Progress, Returned or In Transit at one office "
        "for longer than the window (default 48h), adding a history entry and an alert to "
        "the admin feed, and resolves alerts for documents that have moved on. Statuses are "
        "left alone: a late document is not a missing one. The scan logic lives in "
        "sla_scan.run_overdue_alert_scan() so it stays identical to what the in-process "
        "background scheduler (scheduler.py) runs automatically; this command is for an "
        "OS-level scheduler (Task Scheduler in dev, cron in production) as a backup."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours', type=int, default=DEFAULT_OVERDUE_ALERT_HOURS,
            help=f'Hours at one office before a document is flagged Overdue (default: {DEFAULT_OVERDUE_ALERT_HOURS})',
        )

    def handle(self, *args, **options):
        result = run_overdue_alert_scan(hours=options['hours'])
        self.stdout.write(self.style.SUCCESS(
            f"Checked ({options['hours']}h window): {result['total_stuck']} document(s) overdue, "
            f"{result['alerts_created']} new alert(s), {result['alerts_resolved']} resolved."
        ))
