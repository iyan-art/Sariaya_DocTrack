from django.db import migrations

# Root cause of "Only staff at CIVILREG can release this document, not
# MCRO.": the CIVILREG Office row was deleted (allowed because its
# WorkflowStep rows were removed/reassigned first — Office deletion is
# PROTECTed while any WorkflowStep still points at it). Birth Certificate's
# workflow was rebuilt afterward through the Workflow Builder (which calls
# DocumentType.sync_route_from_steps()), so its cached `route` correctly
# reads ['MCRO', 'MTO', 'MCRO']. Death Certificate and Marriage Certificate
# never got that rebuild: they were left with ZERO WorkflowStep rows, but
# their cached `route` JSONField — which has no FK integrity to Office at
# all — still held the stale ['CIVILREG', 'MTO', 'CIVILREG'] from before.
# Document.current_office is computed from that stale route at save() time,
# so any new Death/Marriage Certificate request was born already pointing
# at an office that no longer exists.
#
# This rebuilds their WorkflowStep rows (mirroring Birth Certificate's
# already-correct MCRO -> MTO -> MCRO shape, since all three are the same
# civil-registry process), resyncs `route`, then re-saves every existing
# Document of these two types so their stored `current_office` recomputes
# from the corrected route instead of staying frozen on 'CIVILREG'.
STEP_SHAPE = [
    (1, 'MCRO', 'Submit the Requirements', 4),
    (2, 'MTO', 'For Payment', 1),
    (3, 'MCRO', 'Releasing of Document', 4),
]

AFFECTED_TYPES = ['Death Certificate', 'Marriage Certificate']


def repair(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    WorkflowStep = apps.get_model('documents', 'WorkflowStep')
    Office = apps.get_model('documents', 'Office')
    Document = apps.get_model('documents', 'Document')

    offices_by_code = {o.code: o for o in Office.objects.filter(code__in=['MCRO', 'MTO'])}
    if not offices_by_code:
        return  # dev DB with different seed data — nothing to repair

    for type_name in AFFECTED_TYPES:
        try:
            document_type = DocumentType.objects.get(name=type_name)
        except DocumentType.DoesNotExist:
            continue

        # Only touch it if it's actually in the broken state (stale route,
        # no real steps behind it) — never overwrite a type an admin has
        # since legitimately reconfigured.
        if document_type.steps.exists():
            continue

        WorkflowStep.objects.bulk_create([
            WorkflowStep(
                document_type=document_type, step_number=num,
                office=offices_by_code[code], action_required=action, max_hours_allowed=hours,
            )
            for num, code, action, hours in STEP_SHAPE
            if code in offices_by_code
        ])

        document_type.route = list(
            document_type.steps.order_by('step_number').values_list('office__code', flat=True)
        )
        document_type.save(update_fields=['route'])

        # Existing in-flight documents of this type had their current_office
        # frozen on the old 'CIVILREG' value — re-save each so it recomputes
        # from the now-correct route.
        for document in Document.objects.filter(document_type=document_type):
            route = document.document_type.route
            document.current_office = route[document.route_position] if document.route_position < len(route) else route[-1]
            document.save(update_fields=['current_office'])


def noop_reverse(apps, schema_editor):
    # Not meaningfully reversible (would mean re-deleting real Office data
    # and re-orphaning documents) — a no-op keeps `migrate` reversible
    # without doing anything destructive.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0020_seed_template_files'),
    ]

    operations = [
        migrations.RunPython(repair, noop_reverse),
    ]
