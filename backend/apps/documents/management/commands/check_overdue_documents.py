from django.core.management.base import BaseCommand

from apps.documents.sla_scan import run_overdue_scan


class Command(BaseCommand):
    help = (
        "Scans every Active (In Progress) document, compares its elapsed dwell time at "
        "its current office against that step's own configured SLA "
        "(WorkflowStep.max_hours_allowed), and emails every responsible active Employee "
        "an Overdue Warning (once per overdue episode) or, if it's not overdue yet but has "
        "crossed 80% of its SLA, a milder Approaching Due Date heads-up instead. Distinct "
        "from check_missing_documents (a separate, more severe 'assumed lost' flag at a "
        "flat 48h). The actual scan logic lives in sla_scan.run_overdue_scan() so it stays "
        "identical to what the in-process background scheduler (scheduler.py) and the "
        "admin 'Run Scan Now' action (behind the notification bell) run — this command "
        "exists for an OS-level scheduler (Windows Task Scheduler in dev, cron in "
        "production) as an alternative/backup to that background scheduler."
    )

    def handle(self, *args, **options):
        result = run_overdue_scan()
        self.stdout.write(self.style.SUCCESS(
            f"Overdue SLA scan complete: {result['documents_overdue']} document(s) past SLA "
            f"({result['emails_sent']} new warning email(s) sent), "
            f"{result['documents_due_soon']} document(s) approaching due date "
            f"({result['due_soon_emails_sent']} new heads-up email(s) sent)."
        ))
