from django.core.management.base import BaseCommand

from apps.documents.sla_scan import DEFAULT_MISSING_SLA_HOURS, run_missing_scan


class Command(BaseCommand):
    help = (
        "Scans documents that are In Progress (sitting at an office) or In Transit "
        "(released but never received) for any past the SLA window (default 48h), "
        "flags them as missing, and raises a MissingDocumentAlert for each. The actual scan "
        "logic lives in sla_scan.run_missing_scan() so it stays identical to what the "
        "in-process background scheduler (scheduler.py) runs automatically — this command "
        "exists for an OS-level scheduler (Windows Task Scheduler in dev, cron in production) "
        "as an alternative/backup to that background scheduler."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours', type=int, default=DEFAULT_MISSING_SLA_HOURS,
            help=f'SLA window in hours before a document counts as stuck (default: {DEFAULT_MISSING_SLA_HOURS})',
        )

    def handle(self, *args, **options):
        result = run_missing_scan(hours=options['hours'])
        self.stdout.write(self.style.SUCCESS(
            f"Checked SLA ({options['hours']}h window): {result['total_stuck']} document(s) past due, "
            f"{result['alerts_created']} new alert(s) created."
        ))
