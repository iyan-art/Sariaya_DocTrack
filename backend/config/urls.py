"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

from apps.documents.views import (
    MissingDocumentAlertListView, DocumentTypeListCreateView, DocumentTypeDetailView, DocumentTypeStepsView,
    OfficeListCreateView, OfficeDetailView, PublicOfficeListView,
    NotificationListView, NotificationUnreadCountView, NotificationMarkReadView, NotificationMarkAllReadView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/documents/', include('apps.documents.urls')),
    path('api/alerts/', MissingDocumentAlertListView.as_view(), name='missing-document-alerts'),

    # Top-level alias for the same document-type catalog served under
    # /api/documents/types/ — same view, same role-filtering logic, just a
    # shorter path for consumers that expect a dedicated /api/document-types/ resource.
    path('api/document-types/', DocumentTypeListCreateView.as_view(), name='document-types-alias-list'),
    path('api/document-types/<int:pk>/', DocumentTypeDetailView.as_view(), name='document-types-alias-detail'),
    path('api/document-types/<int:pk>/steps/', DocumentTypeStepsView.as_view(), name='document-types-alias-steps'),

    path('api/offices/public/', PublicOfficeListView.as_view(), name='office-list-public'),
    path('api/offices/', OfficeListCreateView.as_view(), name='office-list-create'),
    path('api/offices/<int:pk>/', OfficeDetailView.as_view(), name='office-detail'),

    path('api/notifications/', NotificationListView.as_view(), name='notification-list'),
    path('api/notifications/unread-count/', NotificationUnreadCountView.as_view(), name='notification-unread-count'),
    path('api/notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('api/notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Temporary Admin Auto-Creation
from django.contrib.auth import get_user_model
try:
    User = get_user_model()
    # Gagawa ng admin user kung wala pa
    if not User.objects.filter(username='admin').exists():
        admin_user = User.objects.create_superuser('admin', 'admin@gmail.com', 'admin123')
        admin_user.is_active = True
        admin_user.save()
    else:
        # Piliting i-reset ang password at panatilihing active
        admin_user = User.objects.get(username='admin')
        admin_user.email = 'admin@gmail.com'
        admin_user.set_password('admin123')
        admin_user.is_active = True
        admin_user.save()
except Exception as e:
    print(e)
