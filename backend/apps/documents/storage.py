import mimetypes
from urllib.parse import urljoin

from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class DatabaseStorage(Storage):
    """
    Keeps uploaded images (announcement/event pictures, profile photos) in
    the database as StoredFile rows instead of on disk. Hosts like Render
    wipe the disk on every deploy or restart, which would silently lose
    every upload; QR images can be redrawn from their document, but an
    uploaded photo can't. Served by views.serve_stored_media().
    """

    def _model(self):
        return apps.get_model('documents', 'StoredFile')

    def _open(self, name, mode='rb'):
        stored = self._model().objects.filter(name=name).first()
        if stored is None:
            raise FileNotFoundError(name)
        return ContentFile(bytes(stored.content), name=name)

    def _save(self, name, content):
        if hasattr(content, 'seek'):
            content.seek(0)
        data = content.read()
        self._model().objects.create(
            name=name, content=data, size=len(data),
            content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream',
        )
        return name

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        if name:
            self._model().objects.filter(name=name).delete()

    def size(self, name):
        stored = self._model().objects.filter(name=name).only('size').first()
        if stored is None:
            raise FileNotFoundError(name)
        return stored.size

    def url(self, name):
        return urljoin(settings.MEDIA_URL, name)


database_storage = DatabaseStorage()
