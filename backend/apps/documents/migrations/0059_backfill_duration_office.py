"""
Credits every recorded duration to the office that actually held the
document. Before 0058 the time was only stored on the receive log, whose
`office` is the RECEIVING office, so the Heatmap and Top 5 showed each
office with the previous office's time. The holder is the office of the
latest earlier log that put the document in an office's custody.
"""
from django.db import migrations
from django.db.models import Q

CUSTODY_ACTIONS = (
    'created', 'received', 'returned', 'return_received', 'citizen_return_initiated',
    'released', 'return_initiated',
)


def credit_holding_office(apps, schema_editor):
    DocumentLog = apps.get_model('documents', 'DocumentLog')
    timed = DocumentLog.objects.filter(duration_at_office__isnull=False, duration_office__isnull=True)
    for log in timed.only('id', 'document_id', 'timestamp').iterator():
        holder = (
            DocumentLog.objects
            .filter(document_id=log.document_id, action__in=CUSTODY_ACTIONS, office__isnull=False)
            .filter(Q(timestamp__lt=log.timestamp) | Q(timestamp=log.timestamp, id__lt=log.id))
            .order_by('-timestamp', '-id')
            .values_list('office_id', flat=True)
            .first()
        )
        if holder:
            DocumentLog.objects.filter(pk=log.pk).update(duration_office_id=holder)


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0058_log_duration_office'),
    ]

    operations = [
        migrations.RunPython(credit_holding_office, migrations.RunPython.noop),
    ]
