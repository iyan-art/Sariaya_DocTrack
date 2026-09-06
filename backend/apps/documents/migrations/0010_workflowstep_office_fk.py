import django.db.models.deletion
from django.db import migrations, models


def backfill_office_fk(apps, schema_editor):
    """
    Existing WorkflowStep rows only have a free-text office_name (e.g. 'BAC',
    'GSO', 'Admin') — for each one, find-or-create a matching Office row
    (keyed by an uppercased code derived from that text) and point the step
    at it. Admins can rename/enrich these placeholder Office rows afterward
    via the new Office Manager UI; nothing here is destructive.
    """
    WorkflowStep = apps.get_model('documents', 'WorkflowStep')
    Office = apps.get_model('documents', 'Office')

    for step in WorkflowStep.objects.all():
        label = (step.office_name or '').strip()
        if not label:
            continue
        code = label.upper()[:20]
        office, _ = Office.objects.get_or_create(
            code=code,
            defaults={'name': label, 'is_active': True},
        )
        step.office_id = office.id
        step.save(update_fields=['office'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0009_office'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowstep',
            name='office',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='workflow_steps', to='documents.office',
            ),
        ),
        migrations.RunPython(backfill_office_fk, noop_reverse),
        migrations.AlterField(
            model_name='workflowstep',
            name='office',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='workflow_steps', to='documents.office',
            ),
        ),
        migrations.RemoveField(
            model_name='workflowstep',
            name='office_name',
        ),
    ]
