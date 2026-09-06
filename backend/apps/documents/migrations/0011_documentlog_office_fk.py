import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    DocumentLog.office switches from a free-text string to an FK. Safe to do
    as a straight remove+add with no backfill: as of this migration the
    DocumentLog table is empty (no documents have moved through the system
    yet), and the field is nullable going forward (see services.py::resolve_office).
    """

    dependencies = [
        ('documents', '0010_workflowstep_office_fk'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='documentlog',
            name='office',
        ),
        migrations.AddField(
            model_name='documentlog',
            name='office',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='document_logs', to='documents.office',
            ),
        ),
    ]
