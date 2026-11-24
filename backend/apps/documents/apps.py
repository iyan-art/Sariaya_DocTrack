import os
import sys

from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.documents'

    def ready(self):
        # Signal receivers must register unconditionally — every process
        # that imports this app (runserver, shell, a management command, a
        # script using django.setup() directly) needs them connected, not
        # just the one serving live traffic.
        from . import signals  # noqa: F401

        # The SLA/email background scheduler starts only in a process that
        # serves traffic: a gunicorn worker (production), or runserver's
        # reloaded child (it sets RUN_MAIN; its parent only watches files).
        # Never for migrate, shell, tests or other management commands.
        from django.conf import settings
        if not settings.SLA_SCHEDULER_ENABLED:
            return
        under_gunicorn = 'gunicorn' in os.path.basename(sys.argv[0] if sys.argv else '')
        under_runserver = 'runserver' in sys.argv and os.environ.get('RUN_MAIN') == 'true'
        if under_gunicorn or under_runserver:
            from . import scheduler
            scheduler.start()
