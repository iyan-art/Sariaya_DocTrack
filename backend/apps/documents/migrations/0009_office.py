from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0008_seed_document_type_catalog'),
    ]

    operations = [
        migrations.CreateModel(
            name='Office',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, unique=True)),
                ('code', models.CharField(
                    help_text="Short code, e.g. 'TREAS'. Must match a staff member's User.office string for "
                              "release/receive permission checks and document-log attribution to resolve correctly.",
                    max_length=20, unique=True,
                )),
                ('location', models.CharField(blank=True, help_text="Building / floor / room, e.g. 'Municipal Hall, 2nd Floor, Room 204'", max_length=255)),
                ('contact_person', models.CharField(blank=True, help_text='Department head or point of contact', max_length=150)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
    ]
