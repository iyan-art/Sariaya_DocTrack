from django.db import migrations

# (document_type_name, key) -> updates. Only touches fields that already
# exist (created by earlier seed migrations) — reclassifies them into named
# sections, converts "a person's full name" fields to the new composite
# NAME type (still renders as ONE line at the same x/y — see
# document_generation.py — so no position recalibration is needed), and
# upgrades a couple of plain-text fields to SELECT where a fixed set of
# real-world options is obviously more appropriate than free text.
UPDATES = {
    ('Birth Certificate', 'child_full_name'): {'field_type': 'name', 'section': 'Personal Information'},
    ('Birth Certificate', 'date_of_birth'): {'section': 'Personal Information'},
    ('Birth Certificate', 'place_of_birth'): {'section': 'Personal Information'},
    ('Birth Certificate', 'sex'): {
        'field_type': 'select', 'section': 'Personal Information', 'options': ['Male', 'Female'],
    },
    ('Birth Certificate', 'father_full_name'): {'field_type': 'name', 'section': "Parents' Information"},
    ('Birth Certificate', 'mother_maiden_name'): {'field_type': 'name', 'section': "Parents' Information"},
    ('Birth Certificate', 'birth_reg_no'): {'section': 'Registration Details'},
    ('Birth Certificate', 'date_registered'): {'section': 'Registration Details'},
    ('Birth Certificate', 'place_registered'): {'section': 'Registration Details'},

    ('Death Certificate', 'deceased_full_name'): {'field_type': 'name', 'section': 'Personal Information'},
    ('Death Certificate', 'date_of_death'): {'section': 'Personal Information'},
    ('Death Certificate', 'place_of_death'): {'section': 'Personal Information'},
    ('Death Certificate', 'civil_status'): {
        'field_type': 'select', 'section': 'Personal Information',
        'options': ['Single', 'Married', 'Widowed', 'Separated', 'Divorced', 'Annulled'],
    },
    ('Death Certificate', 'father_full_name'): {'field_type': 'name', 'section': "Parents' Information"},
    ('Death Certificate', 'mother_maiden_name'): {'field_type': 'name', 'section': "Parents' Information"},
    ('Death Certificate', 'death_reg_no'): {'section': 'Registration Details'},
    ('Death Certificate', 'date_registered'): {'section': 'Registration Details'},
    ('Death Certificate', 'cause_of_death'): {'field_type': 'textarea', 'section': 'Registration Details'},

    ('Marriage Certificate', 'husband_full_name'): {'field_type': 'name', 'section': "Spouses' Information"},
    ('Marriage Certificate', 'wife_full_name'): {'field_type': 'name', 'section': "Spouses' Information"},
    ('Marriage Certificate', 'date_of_marriage'): {'section': 'Marriage Details'},
    ('Marriage Certificate', 'place_of_marriage'): {'section': 'Marriage Details'},
    ('Marriage Certificate', 'marriage_reg_no'): {'section': 'Registration Details'},
    ('Marriage Certificate', 'date_registered'): {'section': 'Registration Details'},
    ('Marriage Certificate', 'officiating_officer'): {'field_type': 'name', 'section': 'Registration Details'},

    ('Building Permit', 'application_no'): {'section': 'Application Details'},
    ('Building Permit', 'permit_no'): {'section': 'Application Details'},
    ('Building Permit', 'date_of_application'): {'section': 'Application Details'},
    ('Building Permit', 'date_issued'): {'section': 'Application Details'},
    ('Building Permit', 'owner_name'): {'field_type': 'name', 'section': 'Owner Information'},
    ('Building Permit', 'project_location'): {'field_type': 'textarea', 'section': 'Project Information'},
    ('Building Permit', 'estimated_cost'): {'section': 'Project Information'},
    ('Building Permit', 'floor_area'): {'section': 'Project Information'},
    ('Building Permit', 'engineer_architect'): {'field_type': 'name', 'section': 'Project Information'},

    ('Business Permit', 'business_name'): {'section': 'Business Information'},
    ('Business Permit', 'business_address'): {'field_type': 'textarea', 'section': 'Business Information'},
    ('Business Permit', 'nature_of_business'): {'section': 'Business Information'},
    ('Business Permit', 'owner_name'): {'field_type': 'name', 'section': 'Owner Information'},
    ('Business Permit', 'permit_no'): {'section': 'Permit Details'},
    ('Business Permit', 'date_issued'): {'section': 'Permit Details'},
    ('Business Permit', 'mayor_authorized_officer'): {'field_type': 'name', 'section': 'Permit Details'},
}


def reclassify(apps, schema_editor):
    DocumentTemplateField = apps.get_model('documents', 'DocumentTemplateField')
    for (type_name, key), changes in UPDATES.items():
        DocumentTemplateField.objects.filter(document_type__name=type_name, key=key).update(**changes)


def revert(apps, schema_editor):
    DocumentTemplateField = apps.get_model('documents', 'DocumentTemplateField')
    for (type_name, key) in UPDATES.keys():
        DocumentTemplateField.objects.filter(document_type__name=type_name, key=key).update(
            field_type='text', section='', options=[],
        )


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0034_documenttemplatefield_default_value_and_more'),
    ]

    operations = [
        migrations.RunPython(reclassify, revert),
    ]
