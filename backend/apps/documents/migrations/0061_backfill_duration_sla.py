"""
Fills DocumentLog.duration_sla_hours for durations recorded before 0060:
the time limit of the route step the holding office was working on. When
an office appears more than once in a route, its Nth timed stay on that
document is matched to its Nth step there.
"""
from django.db import migrations


def fill_step_sla(apps, schema_editor):
    DocumentLog = apps.get_model('documents', 'DocumentLog')
    WorkflowStep = apps.get_model('documents', 'WorkflowStep')
    timed = (
        DocumentLog.objects
        .filter(duration_at_office__isnull=False, duration_office__isnull=False, duration_sla_hours__isnull=True)
        .select_related('document')
        .order_by('document_id', 'timestamp', 'id')
    )
    stays = {}  # (document, office) -> stays seen so far
    for log in timed.iterator():
        key = (log.document_id, log.duration_office_id)
        nth = stays.get(key, 0)
        stays[key] = nth + 1
        limits = list(
            WorkflowStep.objects
            .filter(document_type_id=log.document.document_type_id, office_id=log.duration_office_id)
            .order_by('step_number')
            .values_list('max_hours_allowed', flat=True)
        )
        if limits:
            DocumentLog.objects.filter(pk=log.pk).update(duration_sla_hours=limits[min(nth, len(limits) - 1)])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0060_log_duration_sla'),
    ]

    operations = [
        migrations.RunPython(fill_step_sla, migrations.RunPython.noop),
    ]
