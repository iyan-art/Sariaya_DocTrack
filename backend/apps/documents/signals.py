from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification, SurveyAnswer, SurveyQuestion
from .services import notify_admins


@receiver(post_save, sender=SurveyAnswer)
def notify_admins_of_low_rating(sender, instance, created, **kwargs):
    """
    Admin-facing "urgent citizen feedback" alert — fires the moment a
    citizen submits a low star rating (<=2) on any survey. A signal catches
    this regardless of which of the several survey-submission flows it came
    through (the general landing-page survey, a per-document office
    evaluation, the post-scan survey, ...) in one place, instead of
    duplicating the same check into every view that creates a SurveyAnswer.
    """
    if not created:
        return
    if instance.question.question_type != SurveyQuestion.QuestionType.RATING:
        return
    if instance.rating_value is None or instance.rating_value > 2:
        return

    survey_title = instance.question.survey.title
    notify_admins(
        title="Urgent Citizen Feedback",
        message=(
            f"A citizen gave a {instance.rating_value}-star rating on \"{survey_title}\" "
            f"— question: \"{instance.question.text}\"."
        ),
        notification_type=Notification.NotificationType.SYSTEM_ALERT,
        related_document=instance.response.document,
    )
