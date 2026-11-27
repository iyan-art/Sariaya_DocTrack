from datetime import date

from django.db import migrations

# Proclamation No. 1006, s. 2025: the 2026 regular holidays and special
# non-working days. EDSA Anniversary (25 February) is a special WORKING
# day, so it is not listed. Eid'l Fitr and Eid'l Adha are proclaimed
# separately each year; the admin adds them (and local holidays) on the
# Holidays page.
HOLIDAYS_2026 = [
    (date(2026, 1, 1), "New Year's Day", 'regular'),
    (date(2026, 2, 17), 'Chinese New Year', 'special'),
    (date(2026, 4, 2), 'Maundy Thursday', 'regular'),
    (date(2026, 4, 3), 'Good Friday', 'regular'),
    (date(2026, 4, 4), 'Black Saturday', 'special'),
    (date(2026, 4, 9), 'Araw ng Kagitingan', 'regular'),
    (date(2026, 5, 1), 'Labor Day', 'regular'),
    (date(2026, 6, 12), 'Independence Day', 'regular'),
    (date(2026, 8, 21), 'Ninoy Aquino Day', 'special'),
    (date(2026, 8, 31), 'National Heroes Day', 'regular'),
    (date(2026, 11, 1), "All Saints' Day", 'special'),
    (date(2026, 11, 2), "All Souls' Day", 'special'),
    (date(2026, 11, 30), 'Bonifacio Day', 'regular'),
    (date(2026, 12, 8), 'Feast of the Immaculate Conception of Mary', 'special'),
    (date(2026, 12, 24), 'Christmas Eve', 'special'),
    (date(2026, 12, 25), 'Christmas Day', 'regular'),
    (date(2026, 12, 30), 'Rizal Day', 'regular'),
    (date(2026, 12, 31), 'Last Day of the Year', 'special'),
]


def preload(apps, schema_editor):
    Holiday = apps.get_model('documents', 'Holiday')
    for day, name, kind in HOLIDAYS_2026:
        Holiday.objects.get_or_create(date=day, defaults={'name': name, 'kind': kind})


def unload(apps, schema_editor):
    Holiday = apps.get_model('documents', 'Holiday')
    Holiday.objects.filter(date__in=[day for day, _, _ in HOLIDAYS_2026]).delete()


class Migration(migrations.Migration):
    dependencies = [('documents', '0067_holiday')]
    operations = [migrations.RunPython(preload, unload)]
