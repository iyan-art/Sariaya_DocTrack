from django.db import migrations

# Follow-up to 0021: that migration assumed Death/Marriage Certificate had
# NO WorkflowStep rows at all and would need them rebuilt from scratch, so
# it skipped any type where steps already existed. In fact their steps had
# already been correctly repointed at MCRO (most likely via the Django
# Admin's DocumentType change page, which exposed `route` as an ordinary
# editable JSON field — see admin.py's new readonly_fields fix) — only the
# cached `route` itself was never resynced, so it kept silently reporting
# the deleted 'CIVILREG' office.
#
# This is a general, type-agnostic repair: resync EVERY DocumentType's
# `route` from its actual live WorkflowStep rows wherever they've drifted,
# then re-save every Document whose stored `current_office` no longer
# matches what its (now-correct) route says it should be — the same
# recomputation Document.save() always does, just applied once to every
# existing row instead of waiting for each document's next natural save().


def resync(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    Document = apps.get_model('documents', 'Document')

    for document_type in DocumentType.objects.all():
        live_route = list(
            document_type.steps.order_by('step_number').values_list('office__code', flat=True)
        )
        if live_route and live_route != document_type.route:
            document_type.route = live_route
            document_type.save(update_fields=['route'])

        if not live_route:
            continue

        for document in Document.objects.filter(document_type=document_type):
            position = document.route_position
            correct_office = live_route[position] if position < len(live_route) else live_route[-1]
            if document.current_office != correct_office:
                document.current_office = correct_office
                document.save(update_fields=['current_office'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0021_repair_civilreg_route_drift'),
    ]

    operations = [
        migrations.RunPython(resync, noop_reverse),
    ]
