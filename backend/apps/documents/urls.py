from django.urls import path
from .views import (
    DocumentListCreateView, DocumentDetailView,
    DocumentScanView, DocumentTransferView, DocumentReleaseView, DocumentFlagMissingView,
    DocumentTrackingLookupView, DocumentTypeListCreateView, DocumentTypeDetailView, DocumentTypeStepsView,
    AdminDashboardStatsView, HeatmapDataView, MyOfficePerformanceView, QRScanResolveView,
    SurveyListCreateView, SurveyDetailView, SurveyQuestionsView, SurveyAnalyticsView, SurveyCommentsView,
    MySurveyCommentsView,
    MyDocumentListView, MyDocumentDetailView, DocumentEvaluationView, PublicDocumentEvaluationView,
    DocumentStageUpdateView, DocumentOfficialFileView, PublicDocumentOfficialFileView,
    GeneratedDocumentView, GenerateDocumentView, DocumentCitizenReturnView,
    EmailNotificationLogListView, RunSlaScanView,
    AnnouncementListView, EventListView, PublicDocumentTypeListView,
)

urlpatterns = [
    path('announcements/', AnnouncementListView.as_view(), name='announcement-list'),
    path('events/', EventListView.as_view(), name='event-list'),

    path('types/public/', PublicDocumentTypeListView.as_view(), name='document-type-list-public'),
    path('types/', DocumentTypeListCreateView.as_view(), name='document-type-list-create'),
    path('types/<int:pk>/', DocumentTypeDetailView.as_view(), name='document-type-detail'),
    path('types/<int:pk>/steps/', DocumentTypeStepsView.as_view(), name='document-type-steps'),
    path('transfer/', DocumentTransferView.as_view(), name='document-transfer'),
    path('qr/scan/', QRScanResolveView.as_view(), name='document-qr-scan'),

    path('surveys/analytics/', SurveyAnalyticsView.as_view(), name='survey-analytics'),
    path('surveys/comments/', SurveyCommentsView.as_view(), name='survey-comments'),
    path('surveys/', SurveyListCreateView.as_view(), name='survey-list-create'),
    path('surveys/<int:pk>/', SurveyDetailView.as_view(), name='survey-detail'),
    path('surveys/<int:pk>/questions/', SurveyQuestionsView.as_view(), name='survey-questions'),

    path('mine/', MyDocumentListView.as_view(), name='my-document-list'),
    path('mine/<int:pk>/', MyDocumentDetailView.as_view(), name='my-document-detail'),

    path('', DocumentListCreateView.as_view(), name='document-list-create'),
    path('<int:pk>/', DocumentDetailView.as_view(), name='document-detail'),
    path('<int:pk>/scan/', DocumentScanView.as_view(), name='document-scan'),
    path('<int:pk>/release/', DocumentReleaseView.as_view(), name='document-release'),
    path('<int:pk>/flag-missing/', DocumentFlagMissingView.as_view(), name='document-flag-missing'),
    path('<int:pk>/stage/', DocumentStageUpdateView.as_view(), name='document-stage-update'),
    path('<int:pk>/evaluation/', DocumentEvaluationView.as_view(), name='document-evaluation'),
    path('<int:pk>/citizen-return/', DocumentCitizenReturnView.as_view(), name='document-citizen-return'),
    path('<int:pk>/official-file/', DocumentOfficialFileView.as_view(), name='document-official-file'),
    path('<int:pk>/generated-document/', GeneratedDocumentView.as_view(), name='generated-document'),
    path('<int:pk>/generated-document/generate/', GenerateDocumentView.as_view(), name='generate-document'),
    path('track/<str:tracking_number>/', DocumentTrackingLookupView.as_view(), name='document-track'),
    path('track/<str:tracking_number>/evaluation/', PublicDocumentEvaluationView.as_view(), name='public-document-evaluation'),
    path('track/<str:tracking_number>/official-file/', PublicDocumentOfficialFileView.as_view(), name='public-document-official-file'),

    path('dashboard-stats/', AdminDashboardStatsView.as_view(), name='admin-stats'),
    path('heatmap/', HeatmapDataView.as_view(), name='heatmap-data'),
    path('my-office-performance/', MyOfficePerformanceView.as_view(), name='my-office-performance'),
    path('my-office-comments/', MySurveyCommentsView.as_view(), name='my-office-comments'),
    path('email-notifications/', EmailNotificationLogListView.as_view(), name='email-notification-log-list'),
    path('email-notifications/run-scan/', RunSlaScanView.as_view(), name='email-notification-run-scan'),
]