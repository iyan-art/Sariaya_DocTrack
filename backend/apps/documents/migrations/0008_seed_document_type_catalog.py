from django.db import migrations

EXTERNAL_TYPES = [
    ('Birth Certificate', 'Certified true copy of a birth record.'),
    ('Marriage Certificate', 'Certified true copy of a marriage record.'),
    ('Death Certificate', 'Certified true copy of a death record.'),
    ('Business Permit', 'Application or renewal of a business permit.'),
    ('Building Permit', 'Application for a building/construction permit.'),
]

INTERNAL_TYPES = [
    ('Purchase Request', 'Internal request for procurement of goods or services.'),
    ('Voucher', 'Internal disbursement voucher.'),
    ('Payroll', 'Internal payroll processing document.'),
]


def seed_document_types(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for name, description in EXTERNAL_TYPES:
        DocumentType.objects.get_or_create(
            name=name,
            defaults={'description': description, 'scope': 'external', 'route': [], 'is_active': True},
        )
    for name, description in INTERNAL_TYPES:
        DocumentType.objects.get_or_create(
            name=name,
            defaults={'description': description, 'scope': 'internal', 'route': [], 'is_active': True},
        )


def remove_seeded_document_types(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    names = [name for name, _ in EXTERNAL_TYPES + INTERNAL_TYPES]
    # Only removes rows that were never actually used (in_use documents
    # protect on delete elsewhere too, but this is a reverse migration —
    # skip any that already have documents attached rather than erroring).
    DocumentType.objects.filter(name__in=names, documents__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0007_documenttype_scope'),
    ]

    operations = [
        migrations.RunPython(seed_document_types, remove_seeded_document_types),
    ]
