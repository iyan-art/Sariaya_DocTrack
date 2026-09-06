import os

from django.core.files import File
from django.db import migrations

# Real official files supplied by the project owner (outside the repo, on
# their machine) — copied into media/document_templates/ and attached to
# the matching DocumentType by name. All 5 are flat, non-fillable PDFs
# (confirmed no /AcroForm), so they're served as-is rather than field-filled.
SOURCE_FILES = {
    'Birth Certificate': r'C:\Users\liann\Downloads\1\Birth Certificate Application Form.pdf',
    'Marriage Certificate': r'C:\Users\liann\Downloads\1\Marriage Certificate Application Form.pdf',
    'Death Certificate': r'C:\Users\liann\Downloads\1\Death Certificate Application Form.pdf',
    'Building Permit': r'C:\Users\liann\Downloads\building_permit_sariaya.pdf',
    'Business Permit': r'C:\Users\liann\Downloads\1\Application-Form_Business-Permit (1).pdf',
}


def seed_template_files(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for name, source_path in SOURCE_FILES.items():
        if not os.path.isfile(source_path):
            # Source lives outside the repo on the original dev machine —
            # don't hard-fail `migrate` elsewhere; just skip it silently.
            continue
        try:
            document_type = DocumentType.objects.get(name=name)
        except DocumentType.DoesNotExist:
            continue
        if document_type.template_file:
            continue
        with open(source_path, 'rb') as f:
            document_type.template_file.save(os.path.basename(source_path), File(f), save=True)


def clear_template_files(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    DocumentType.objects.exclude(template_file='').update(template_file='')


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0019_document_copy_preference_documenttype_template_file'),
    ]

    operations = [
        migrations.RunPython(seed_template_files, clear_template_files),
    ]
