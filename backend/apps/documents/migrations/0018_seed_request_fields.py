from django.db import migrations


def field(key, label, type='text', required=True, placeholder='', options=None, help_text=''):
    d = {'key': key, 'label': label, 'type': type, 'required': required}
    if placeholder:
        d['placeholder'] = placeholder
    if options:
        d['options'] = options
    if help_text:
        d['help_text'] = help_text
    return d


RELATIONSHIP_OPTIONS = ['Self', 'Parent', 'Sibling', 'Spouse', 'Child', 'Authorized Representative', 'Other']

REQUEST_FIELDS = {
    'Birth Certificate': [
        field('child_full_name', "Full Name of Child"),
        field('date_of_birth', "Date of Birth", type='date'),
        field('place_of_birth', "Place of Birth", placeholder='Hospital / City'),
        field('mother_maiden_name', "Mother's Maiden Name"),
        field('father_full_name', "Father's Full Name", required=False),
        field('requestor_relationship', "Relationship to the Child", type='select', options=RELATIONSHIP_OPTIONS),
        field('purpose', "Purpose", type='select', options=[
            'Employment', 'School / Enrollment', 'Passport Application', 'Travel', 'Government Transaction', 'Other',
        ]),
        field('number_of_copies', "Number of Copies", type='number', placeholder='1'),
        field('contact_no', "Contact Number", type='tel'),
    ],
    'Marriage Certificate': [
        field('husband_full_name', "Husband's Full Name"),
        field('wife_full_name', "Wife's Full Name"),
        field('date_of_marriage', "Date of Marriage", type='date'),
        field('place_of_marriage', "Place of Marriage"),
        field('requestor_relationship', "Relationship to the Couple", type='select', options=RELATIONSHIP_OPTIONS),
        field('purpose', "Purpose", type='select', options=[
            'Legal Proceedings', 'Passport Application', 'Insurance Claim', 'Government Transaction', 'Other',
        ]),
        field('number_of_copies', "Number of Copies", type='number', placeholder='1'),
        field('contact_no', "Contact Number", type='tel'),
    ],
    'Death Certificate': [
        field('deceased_full_name', "Full Name of Deceased"),
        field('date_of_death', "Date of Death", type='date'),
        field('place_of_death', "Place of Death"),
        field('requestor_relationship', "Relationship to the Deceased", type='select', options=RELATIONSHIP_OPTIONS),
        field('purpose', "Purpose", type='select', options=[
            'Insurance Claim', 'Estate Settlement', 'Burial Permit', 'Government Transaction', 'Other',
        ]),
        field('number_of_copies', "Number of Copies", type='number', placeholder='1'),
        field('contact_no', "Contact Number", type='tel'),
    ],
    'Business Permit': [
        field('business_name', "Business Name"),
        field('business_address', "Business Address", type='textarea'),
        field('nature_of_business', "Nature of Business", placeholder='e.g. Retail, Food Service'),
        field('owner_name', "Owner / Applicant Name"),
        field('capitalization', "Capitalization (₱)", type='number', required=False),
        field('floor_area', "Floor Area (sqm)", type='number', required=False),
        field('contact_no', "Contact Number", type='tel'),
    ],
    'Building Permit': [
        field('project_location', "Project Location", type='textarea'),
        field('owner_name', "Owner / Applicant Name"),
        field('lot_area', "Lot Area (sqm)", type='number'),
        field('floor_area', "Floor Area (sqm)", type='number'),
        field('construction_type', "Type of Construction", type='select', options=[
            'New Construction', 'Renovation', 'Addition', 'Demolition', 'Repair',
        ]),
        field('estimated_cost', "Estimated Project Cost (₱)", type='number'),
        field('contact_no', "Contact Number", type='tel'),
    ],
    'Payroll': [
        field('pay_period', "Pay Period", placeholder='e.g. August 1-15, 2026'),
        field('department', "Department"),
        field('remarks', "Remarks", type='textarea', required=False),
    ],
    'Purchase Request': [
        field('items_description', "Items / Services Requested", type='textarea'),
        field('quantity', "Quantity", required=False),
        field('estimated_cost', "Estimated Cost (₱)", type='number'),
        field('purpose', "Purpose", type='textarea'),
    ],
    'Voucher': [
        field('payee_name', "Payee Name"),
        field('amount', "Amount (₱)", type='number'),
        field('particulars', "Particulars / Purpose", type='textarea'),
    ],
}


def seed_request_fields(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    for name, fields in REQUEST_FIELDS.items():
        DocumentType.objects.filter(name=name).update(request_fields=fields)


def clear_request_fields(apps, schema_editor):
    DocumentType = apps.get_model('documents', 'DocumentType')
    DocumentType.objects.filter(name__in=REQUEST_FIELDS.keys()).update(request_fields=[])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0017_documenttype_request_fields'),
    ]

    operations = [
        migrations.RunPython(seed_request_fields, clear_request_fields),
    ]
