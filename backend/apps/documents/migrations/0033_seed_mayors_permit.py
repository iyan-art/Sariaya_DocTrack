from django.db import migrations

# Business rule: the same document name can exist under both purposes (see
# DocumentType's new (name, scope) uniqueness in migration 0032) — Mayor's
# Permit is the first real example, requested for both an EXTERNAL
# (citizen-requestable, processed through the permits/licensing office) and
# an INTERNAL (staff-only, e.g. an internal authorization routed through
# Accounting) flavor. Each gets its own independent 3-step route so an
# admin can freely retune either one later via the Workflow Builder without
# touching the other.
ROUTES = [
    ('external', 'Requested by a citizen; countersigned by the Mayor\'s Office.', [
        ('BPLO', 'Application Received', 24),
        ('MAYOR', 'Mayor\'s Signature', 48),
        ('BPLO', 'Ready for Release', 24),
    ]),
    ('internal', 'Staff-only internal authorization requiring the Mayor\'s signature.', [
        ('MAO', 'Request Prepared', 24),
        ('MAYOR', 'Mayor\'s Signature', 48),
        ('MAO', 'Ready for Release', 24),
    ]),
]


def seed_mayors_permit(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    WorkflowStep = apps.get_model('documents', 'WorkflowStep')
    Office = apps.get_model('documents', 'Office')

    for scope, description, steps in ROUTES:
        document_type, created = DocumentType.objects.get_or_create(
            name="Mayor's Permit", scope=scope,
            defaults={'description': description, 'route': [], 'is_active': True},
        )
        if not created:
            continue  # Already seeded (or hand-created by an admin) — leave it alone.

        for step_number, (office_code, action_required, max_hours_allowed) in enumerate(steps, start=1):
            office = Office.objects.filter(code=office_code).first()
            if not office:
                continue  # Office catalog doesn't have this code on this DB — skip rather than crash the migration.
            WorkflowStep.objects.create(
                document_type=document_type, step_number=step_number,
                office=office, action_required=action_required, max_hours_allowed=max_hours_allowed,
            )
        document_type.route = list(
            WorkflowStep.objects.filter(document_type=document_type).order_by('step_number').values_list('office__code', flat=True)
        )
        document_type.save(update_fields=['route'])


def remove_mayors_permit(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    # Only removes rows never actually used — same safety pattern as
    # migration 0008's reverse function.
    DocumentType.objects.filter(name="Mayor's Permit", documents__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0032_document_guest_name_alter_documenttype_name_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_mayors_permit, remove_mayors_permit),
    ]
