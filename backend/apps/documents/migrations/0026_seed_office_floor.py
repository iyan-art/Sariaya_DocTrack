import re

from django.db import migrations

# `location` is free text and, in the live data, holds two different kinds
# of value depending on the office: some are an actual floor designation
# ("3rd Floor"), others are just the building name ("Municipal Hall"). Only
# the unambiguous ones — those that match a plain "Nth Floor" pattern — get
# copied into the new `floor` field here. Every other office (including
# MCRO, whose location is "Municipal Hall") is left blank rather than
# guessing wrong; an admin sets those via Office Manager.
FLOOR_PATTERN = re.compile(r'^\d+(st|nd|rd|th)\s+floor$', re.IGNORECASE)


def seed_floor(apps, schema_editor):
    Office = apps.get_model('documents', 'Office')
    for office in Office.objects.all():
        if office.location and FLOOR_PATTERN.match(office.location.strip()):
            office.floor = office.location.strip()
            office.save(update_fields=['floor'])


def clear_floor(apps, schema_editor):
    Office = apps.get_model('documents', 'Office')
    Office.objects.update(floor='')


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0025_office_floor_alter_office_location'),
    ]

    operations = [
        migrations.RunPython(seed_floor, clear_floor),
    ]
