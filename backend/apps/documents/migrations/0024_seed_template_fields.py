from django.db import migrations

# Field positions calibrated by directly inspecting each of the 5 real
# template files (see document_generation.py for how these get drawn, and
# the plan notes on why exact per-character-box alignment on the scanned
# PSA forms isn't attempted). Positions are expressed as (x_fraction,
# y_fraction_from_top) against each page's own dimensions — after
# transfer_rotation_to_content() normalizes the PSA scans' baked-in
# /Rotate 90, every page here is used exactly as it visually appears.
#
# PAGE_SIZES matches what was read directly off each stored file via
# pypdf (see the implementation notes) — used only to convert the
# fractional estimates below into absolute PDF points at seed time.
PAGE_SIZES = {
    'Birth Certificate': (612.0, 792.0),
    'Marriage Certificate': (612.0, 792.0),
    'Death Certificate': (612.0, 792.0),
    'Building Permit': (595.27, 841.89),
    'Business Permit': (612.0, 1008.0),
}


def pt(type_name, x_frac, y_frac_from_top):
    width, height = PAGE_SIZES[type_name]
    return round(width * x_frac, 1), round(height * (1 - y_frac_from_top), 1)


def tf(type_name, key, label, page, x_frac, y_frac_from_top, order,
       field_type='text', source_request_key='', font_size=9, rotation=0):
    x, y = pt(type_name, x_frac, y_frac_from_top)
    return {
        'key': key, 'label': label, 'field_type': field_type,
        'source_request_key': source_request_key, 'page_number': page,
        'x': x, 'y': y, 'font_size': font_size, 'rotation': rotation, 'order': order,
    }


# Coordinates below were calibrated by rendering a percentage grid directly
# on top of each real template page (a temporary reportlab overlay used only
# during development, not part of the app) and reading off where each
# labeled row actually falls — not guessed from a generic layout assumption.
TEMPLATE_FIELDS = {
    'Birth Certificate': [
        tf('Birth Certificate', 'child_full_name', "Child's Full Name", 1, 0.30, 0.44, 1, source_request_key='child_full_name'),
        tf('Birth Certificate', 'date_of_birth', "Date of Birth", 1, 0.34, 0.565, 2, field_type='date', source_request_key='date_of_birth'),
        tf('Birth Certificate', 'place_of_birth', "Place of Birth", 1, 0.16, 0.615, 3, source_request_key='place_of_birth'),
        tf('Birth Certificate', 'father_full_name', "Father's Full Name", 1, 0.30, 0.665, 4, source_request_key='father_full_name'),
        tf('Birth Certificate', 'mother_maiden_name', "Mother's Maiden Name", 1, 0.30, 0.775, 5, source_request_key='mother_maiden_name'),
        tf('Birth Certificate', 'sex', 'Sex', 1, 0.06, 0.51, 6, field_type='text'),
        tf('Birth Certificate', 'birth_reg_no', 'Birth Registration No.', 1, 0.05, 0.375, 7, font_size=7),
        tf('Birth Certificate', 'date_registered', 'Date Registered', 2, 0.03, 0.44, 8, field_type='date', font_size=7),
        tf('Birth Certificate', 'place_registered', 'Place Registered', 2, 0.03, 0.47, 9, font_size=7),
    ],
    'Marriage Certificate': [
        tf('Marriage Certificate', 'husband_full_name', "Husband's Full Name", 1, 0.36, 0.43, 1, source_request_key='husband_full_name'),
        tf('Marriage Certificate', 'wife_full_name', "Wife's Full Name", 1, 0.36, 0.565, 2, source_request_key='wife_full_name'),
        tf('Marriage Certificate', 'date_of_marriage', 'Date of Marriage', 1, 0.36, 0.685, 3, field_type='date', source_request_key='date_of_marriage'),
        tf('Marriage Certificate', 'place_of_marriage', 'Place of Marriage', 1, 0.36, 0.735, 4, source_request_key='place_of_marriage'),
        tf('Marriage Certificate', 'marriage_reg_no', 'Marriage Registration No.', 1, 0.03, 0.335, 5, font_size=7),
        tf('Marriage Certificate', 'date_registered', 'Date Registered', 2, 0.03, 0.42, 6, field_type='date', font_size=7),
        tf('Marriage Certificate', 'officiating_officer', 'Officiating Officer', 2, 0.03, 0.45, 7, font_size=7),
    ],
    'Death Certificate': [
        tf('Death Certificate', 'deceased_full_name', "Deceased's Full Name", 1, 0.30, 0.39, 1, source_request_key='deceased_full_name', rotation=-2),
        tf('Death Certificate', 'date_of_death', 'Date of Death', 1, 0.34, 0.535, 2, field_type='date', source_request_key='date_of_death', rotation=-2),
        tf('Death Certificate', 'place_of_death', 'Place of Death', 1, 0.16, 0.565, 3, source_request_key='place_of_death', rotation=-2),
        tf('Death Certificate', 'father_full_name', "Father's Full Name", 1, 0.30, 0.645, 4, rotation=-2),
        tf('Death Certificate', 'mother_maiden_name', "Mother's Maiden Name", 1, 0.30, 0.745, 5, rotation=-2),
        tf('Death Certificate', 'death_reg_no', 'Death Registration No.', 1, 0.05, 0.325, 6, font_size=7),
        tf('Death Certificate', 'date_registered', 'Date Registered', 2, 0.03, 0.42, 7, field_type='date', font_size=7),
        tf('Death Certificate', 'cause_of_death', 'Cause of Death', 2, 0.03, 0.45, 8, font_size=7),
        tf('Death Certificate', 'civil_status', 'Civil Status', 2, 0.03, 0.48, 9, font_size=7),
    ],
    'Business Permit': [
        tf('Business Permit', 'business_name', 'Business Name', 1, 0.15, 0.335, 1, source_request_key='business_name'),
        tf('Business Permit', 'owner_name', 'Owner / Applicant Name', 1, 0.10, 0.30, 2, source_request_key='owner_name'),
        tf('Business Permit', 'business_address', 'Business Address', 1, 0.15, 0.383, 3, source_request_key='business_address'),
        tf('Business Permit', 'nature_of_business', 'Nature of Business', 1, 0.03, 0.762, 4, source_request_key='nature_of_business', font_size=8),
        tf('Business Permit', 'permit_no', 'Business Permit No.', 1, 0.60, 0.045, 5, font_size=8),
        tf('Business Permit', 'date_issued', 'Date Issued', 1, 0.60, 0.06, 6, field_type='date', font_size=8),
        tf('Business Permit', 'mayor_authorized_officer', 'Mayor / Authorized Officer', 1, 0.15, 0.885, 7, font_size=8),
    ],
    'Building Permit': [
        tf('Building Permit', 'application_no', 'Application No.', 1, 0.22, 0.168, 1, font_size=8),
        tf('Building Permit', 'permit_no', 'Building Permit No.', 1, 0.60, 0.177, 2, font_size=8),
        tf('Building Permit', 'date_of_application', 'Date of Application', 1, 0.24, 0.193, 3, field_type='date', font_size=8),
        tf('Building Permit', 'date_issued', 'Date Issued', 1, 0.62, 0.193, 4, field_type='date', font_size=8),
        tf('Building Permit', 'owner_name', 'Owner Name', 1, 0.19, 0.242, 5, source_request_key='owner_name'),
        tf('Building Permit', 'project_location', 'Project Location', 1, 0.20, 0.298, 6, source_request_key='project_location'),
        tf('Building Permit', 'estimated_cost', 'Estimated Cost', 1, 0.05, 0.545, 7, field_type='number', source_request_key='estimated_cost'),
        tf('Building Permit', 'floor_area', 'Floor Area', 1, 0.42, 0.545, 8, field_type='number', source_request_key='floor_area'),
        tf('Building Permit', 'engineer_architect', 'Engineer / Architect', 1, 0.20, 0.398, 9, font_size=8),
    ],
}


def seed_template_fields(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    DocumentTemplateField = apps.get_model('documents', 'DocumentTemplateField')
    for name, fields in TEMPLATE_FIELDS.items():
        try:
            document_type = DocumentType.objects.get(name=name)
        except DocumentType.DoesNotExist:
            continue
        if document_type.template_fields.exists():
            continue
        DocumentTemplateField.objects.bulk_create([
            DocumentTemplateField(document_type=document_type, **field) for field in fields
        ])


def clear_template_fields(apps, schema_editor):
    DocumentTemplateField = apps.get_model('documents', 'DocumentTemplateField')
    DocumentTemplateField.objects.filter(document_type__name__in=TEMPLATE_FIELDS.keys()).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0023_generateddocument_documenttemplatefield_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_template_fields, clear_template_fields),
    ]
