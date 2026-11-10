from django.db import migrations

# A fresh deployment has no survey at all, so every "Rate Your Experience"
# and Citizen Feedback lookup answered "No evaluation form is available".
# This gives it a starting form only when there is no active survey with
# questions; admins can edit it, replace it, or deactivate it in the
# Survey Builder like any other survey.
TITLE = 'Service Feedback Survey / Survey sa Serbisyo'
QUESTIONS = [
    ('rating', 'How satisfied are you with the overall service you received?\n'
               'Gaano kayo nasiyahan sa kabuuang serbisyong inyong natanggap?'),
    ('rating', 'How satisfied are you with the assistance provided by the staff?\n'
               'Gaano kayo nasiyahan sa tulong na ibinigay ng aming staff?'),
    ('text', 'What can we improve about our service?\n'
             'Ano ang maaari naming pagbutihin sa aming serbisyo?'),
]


def create_default_survey(apps, schema_editor):
    Survey = apps.get_model('documents', 'Survey')
    SurveyQuestion = apps.get_model('documents', 'SurveyQuestion')
    if Survey.objects.filter(is_active=True, questions__isnull=False).exists():
        return
    survey = Survey.objects.create(
        title=TITLE,
        description='Your feedback goes straight into each office\'s performance record.',
        is_active=True,
    )
    SurveyQuestion.objects.bulk_create([
        SurveyQuestion(survey=survey, order=order, question_type=kind, text=text)
        for order, (kind, text) in enumerate(QUESTIONS, start=1)
    ])


def remove_default_survey(apps, schema_editor):
    Survey = apps.get_model('documents', 'Survey')
    # Only an untouched default: never delete a survey people have answered.
    Survey.objects.filter(title=TITLE, created_by__isnull=True, responses__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0049_returned_status'),
    ]

    operations = [
        migrations.RunPython(create_default_survey, remove_default_survey),
    ]
