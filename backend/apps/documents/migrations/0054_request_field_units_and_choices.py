import re

from django.db import migrations

# Free text for Nature of Business produced a different spelling for every
# business; a fixed list keeps it consistent and reportable.
NATURE_OF_BUSINESS_OPTIONS = [
    'Retail / Sari-sari Store',
    'Wholesale / Distribution',
    'Food Service (Restaurant, Eatery, Bakery)',
    'Personal Services (Salon, Laundry, Repair)',
    'Professional Services',
    'Manufacturing / Production',
    'Agriculture / Fishery',
    'Construction / Contractor',
    'Transportation / Logistics',
    'Lodging / Accommodation',
    'Financial Services (Lending, Pawnshop)',
    'Other',
]
# A unit written in the label moves into the input itself: "₱" in front of
# amounts, "sq m" after areas.
PESO = re.compile(r'\s*\(₱\)\s*$')
SQM = re.compile(r'\s*\(sqm\)\s*$', re.IGNORECASE)


def add_units_and_choices(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for document_type in DocumentType.objects.all():
        fields = document_type.request_fields or []
        changed = False
        for field in fields:
            label = field.get('label', '')
            if PESO.search(label):
                field['label'] = PESO.sub('', label)
                field['prefix'] = '₱'
                changed = True
            elif SQM.search(label):
                field['label'] = SQM.sub('', label)
                field['suffix'] = 'sq m'
                changed = True
            if field.get('key') == 'nature_of_business' and field.get('type') == 'text':
                field['type'] = 'select'
                field['options'] = NATURE_OF_BUSINESS_OPTIONS
                field.pop('placeholder', None)
                changed = True
        if changed:
            document_type.request_fields = fields
            document_type.save(update_fields=['request_fields'])


def remove_units_and_choices(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for document_type in DocumentType.objects.all():
        fields = document_type.request_fields or []
        changed = False
        for field in fields:
            if field.pop('prefix', None) == '₱':
                field['label'] = f"{field['label']} (₱)"
                changed = True
            if field.pop('suffix', None) == 'sq m':
                field['label'] = f"{field['label']} (sqm)"
                changed = True
            if field.get('key') == 'nature_of_business' and field.get('options') == NATURE_OF_BUSINESS_OPTIONS:
                field['type'] = 'text'
                field.pop('options')
                field['placeholder'] = 'e.g. Retail, Food Service'
                changed = True
        if changed:
            document_type.request_fields = fields
            document_type.save(update_fields=['request_fields'])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0053_overdue_and_missing_reports'),
    ]

    operations = [
        migrations.RunPython(add_units_and_choices, remove_units_and_choices),
    ]
