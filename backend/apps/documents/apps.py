import os
import sys

from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.documents'

    def ready(self):
        # AppConfig.ready() fires for every management command (migrate,
        # makemigrations, shell, tests...), not just `runserver` — and under
        # the dev autoreloader it fires twice (the parent watcher process,
        # then the reloaded child that actually serves requests; only the
        # child sets RUN_MAIN). Gating on both means the SLA/email
        # background scheduler starts exactly once, and only in the process
        # that's actually going to serve traffic.
        if 'runserver' not in sys.argv or os.environ.get('RUN_MAIN') != 'true':
            return
        from . import scheduler
        scheduler.start()
