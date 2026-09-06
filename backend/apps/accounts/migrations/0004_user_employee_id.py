from django.db import migrations, models


def backfill_employee_ids(apps, schema_editor):
    """
    Assigns EMP-<year>-<seq> ids (sequence resets per calendar year, based on
    each user's date_joined year) to any existing admin/employee accounts
    that don't have one yet, oldest first, so ids come out in signup order.
    """
    User = apps.get_model('accounts', 'User')
    counters = {}  # year -> next sequence number

    staff = User.objects.filter(
        role__in=['admin', 'employee'], employee_id__isnull=True,
    ).order_by('date_joined')

    for user in staff:
        year = user.date_joined.year
        seq = counters.get(year, 1)
        user.employee_id = f"EMP-{year}-{seq:04d}"
        user.save(update_fields=['employee_id'])
        counters[year] = seq + 1


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_alter_user_role_accesslog'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='employee_id',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, unique=True),
        ),
        migrations.RunPython(backfill_employee_ids, noop_reverse),
    ]
