from django.db import migrations

# Counts of things: whole numbers greater than zero. Purchase Request's
# Quantity was a free-text box; it becomes a number field like the rest.
WHOLE_NUMBER_KEYS = {'number_of_copies', 'quantity'}


def mark_whole_number_fields(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for document_type in DocumentType.objects.all():
        fields = document_type.request_fields or []
        changed = False
        for field in fields:
            if field.get('key') in WHOLE_NUMBER_KEYS and field.get('type') in ('number', 'text'):
                field['type'] = 'number'
                field['integer'] = True
                changed = True
        if changed:
            document_type.request_fields = fields
            document_type.save(update_fields=['request_fields'])


def unmark_whole_number_fields(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for document_type in DocumentType.objects.all():
        fields = document_type.request_fields or []
        changed = False
        for field in fields:
            if field.pop('integer', None) is not None:
                changed = True
                if field.get('key') == 'quantity':
                    field['type'] = 'text'  # as it was before
        if changed:
            document_type.request_fields = fields
            document_type.save(update_fields=['request_fields'])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0047_internal_release_to_origin'),
    ]

    operations = [
        migrations.RunPython(mark_whole_number_fields, unmark_whole_number_fields),
    ]
