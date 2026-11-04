import json
from pathlib import Path

from django.db import migrations

CATALOG_PATH = Path(__file__).resolve().parent.parent / 'seed_data' / 'office_catalog.json'


def seed_office_catalog(apps, schema_editor):
    """
    Sets up offices, document types, and their workflows on a brand-new
    database, such as a fresh production deploy. An existing Office row means
    this database has already been set up, so it is left completely untouched.
    """
    Office = apps.get_model('documents', 'Office')
    DocumentType = apps.get_model('documents', 'DocumentType')
    WorkflowStep = apps.get_model('documents', 'WorkflowStep')

    if Office.objects.exists():
        return

    catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))

    offices = {row['code']: Office.objects.create(**row) for row in catalog['offices']}

    # Earlier migrations also seed types that are no longer in use. With no
    # steps they have no route to run on, so keep them out of the request forms.
    in_catalog = {(row['name'], row['scope']) for row in catalog['document_types']}
    for document_type in DocumentType.objects.all():
        if (document_type.name, document_type.scope) not in in_catalog and not document_type.steps.exists():
            document_type.is_active = False
            document_type.save(update_fields=['is_active'])

    for row in catalog['document_types']:
        steps = row.pop('steps')
        # Earlier migrations already seed some of these types by name.
        document_type, _ = DocumentType.objects.update_or_create(
            name=row.pop('name'), scope=row.pop('scope'), defaults=row,
        )

        document_type.steps.all().delete()
        for step in steps:
            WorkflowStep.objects.create(
                document_type=document_type, **{**step, 'office': offices[step['office']]},
            )
        # Historical models lack DocumentType.sync_route_from_steps().
        document_type.route = [step['office'] for step in steps]
        document_type.save(update_fields=['route'])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0042_alter_emailnotificationlog_notification_type'),
    ]

    operations = [
        migrations.RunPython(seed_office_catalog, migrations.RunPython.noop),
    ]
