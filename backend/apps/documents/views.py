import io

from rest_framework import generics, status
from rest_framework.exceptions import ValidationError, NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction, IntegrityError
from django.http import FileResponse
from django.shortcuts import get_object_or_404

from .models import (
    Document, DocumentType, WorkflowStep, Office, DocumentLog, MissingDocumentAlert,
    Survey, SurveyQuestion, SurveyQuestionOption, SurveyAnswer, SurveyResponse,
    CitizenSuggestion, GeneratedDocument, EmailNotificationLog,
    DocumentTemplateField, Announcement, Event, Notification,
)
from .serializers import (
    DocumentSerializer, DocumentDetailSerializer, CreateDocumentSerializer, DocumentTypeSerializer,
    DocumentTypeWriteSerializer, WorkflowStepsReplaceSerializer, OfficeSerializer,
    DocumentTransferSerializer, MissingDocumentAlertSerializer, PublicDocumentTrackingSerializer,
    SurveySerializer, SurveyWriteSerializer, SurveyQuestionsReplaceSerializer, GeneratedDocumentSerializer,
    SurveyCommentSerializer, CitizenSuggestionSerializer, CitizenSuggestionAdminSerializer,
    EmailNotificationLogSerializer, PublicOfficeSerializer,
    AnnouncementSerializer, EventSerializer, PublicDocumentTypeSerializer,
    NotificationSerializer,
)
from .document_generation import render_generated_document
from django.core.files.base import ContentFile
from .permissions import IsStaffUser
from apps.accounts.permissions import IsAdmin
from .services import release_document, receive_document, return_document, citizen_return_document, release_to_citizen, flag_missing, resolve_office, advance_processing_stage, can_delete_document, expedite_document
from .sla_scan import run_overdue_scan, run_missing_scan
from .qr_services import resolve_and_verify, enforce_scope_access, build_scan_context
from rest_framework.permissions import AllowAny, IsAuthenticated

from django.db.models import Count, Avg, F, Subquery, OuterRef, DurationField, ExpressionWrapper
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta

from apps.accounts.models import AccessLog
from apps.accounts.views import _client_ip


class OfficeListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/offices/   full CRUD for admins, read-only for staff/citizens:
                            - citizen/employee: active offices only
                            - admin: active offices only, or ?all=true to
                              include archived ones (needed to manage them)
    POST /api/offices/   admin-only.
    """
    serializer_class = OfficeSerializer

    def get_queryset(self):
        qs = Office.objects.all().order_by('name')
        if self.request.user.role == 'admin' and self.request.query_params.get('all') == 'true':
            return qs
        return qs.filter(is_active=True)

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAuthenticated()]


class OfficeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/offices/<id>/
    Read is open to any authenticated role; editing/deleting is admin-only.
    """
    queryset = Office.objects.all()
    serializer_class = OfficeSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == 'GET' else [IsAdmin()]


class PublicOfficeListView(generics.ListAPIView):
    """
    GET /api/offices/public/
    Anonymous-safe office directory for the Landing page's "Municipal
    Information" section — active offices only, narrowed fields (see
    PublicOfficeSerializer). Distinct from OfficeListCreateView above, which
    requires authentication (it's the staff/admin management endpoint).
    """
    serializer_class = PublicOfficeSerializer
    permission_classes = [AllowAny]
    queryset = Office.objects.filter(is_active=True).order_by('name')


class AnnouncementListView(generics.ListAPIView):
    """
    GET /api/documents/announcements/
    Anonymous-safe, read-only. Powers the Landing page's "Latest
    Announcements" section. No seed data ships with this — an empty table
    means the section shows a genuine "nothing posted yet" state instead of
    fabricated municipal news; real entries are added via Django Admin.
    """
    serializer_class = AnnouncementSerializer
    permission_classes = [AllowAny]
    queryset = Announcement.objects.filter(is_active=True).order_by('-published_at')


class PublicDocumentTypeListView(generics.ListAPIView):
    """
    GET /api/documents/types/public/
    Anonymous-safe. Powers the Landing page's "Documents We Process"
    informational list — active, EXTERNAL (citizen-facing) document types
    only, name/description only (see PublicDocumentTypeSerializer). Distinct
    from DocumentTypeListCreateView, which requires authentication.
    """
    serializer_class = PublicDocumentTypeSerializer
    permission_classes = [AllowAny]
    queryset = DocumentType.objects.filter(is_active=True, scope=DocumentType.Scope.EXTERNAL).order_by('name')


class EventListView(generics.ListAPIView):
    """
    GET /api/documents/events/
    Anonymous-safe, read-only. Powers the Landing page's "Events in
    Sariaya" section. Same no-fake-seed-data pattern as AnnouncementListView.
    """
    serializer_class = EventSerializer
    permission_classes = [AllowAny]
    queryset = Event.objects.filter(is_active=True).order_by('start_date')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.workflow_steps.exists():
            return Response(
                {"detail": "Cannot delete an office already used by workflow steps. Deactivate it instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class DocumentTypeListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/documents/types/   role-filtered dynamic catalog query:
                                    - citizen: only active + EXTERNAL types
                                      (what they're allowed to request)
                                    - staff/admin: all active types, or
                                      ?all=true to include archived ones too
                                      (needed by the admin Document Type
                                      Manager / Workflow Builder screens)
    POST /api/documents/types/   admin creates a bare document type; steps
                                  are defined afterward via .../<id>/steps/.
    """

    def get_queryset(self):
        qs = DocumentType.objects.all().order_by('name')
        if self.request.user.role == 'citizen':
            return qs.filter(is_active=True, scope=DocumentType.Scope.EXTERNAL)
        if self.request.query_params.get('all') != 'true':
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAuthenticated()]

    def get_serializer_class(self):
        return DocumentTypeWriteSerializer if self.request.method == 'POST' else DocumentTypeSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_type = serializer.save()
        return Response(DocumentTypeSerializer(document_type).data, status=status.HTTP_201_CREATED)


class DocumentTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/documents/types/<id>/
    Renaming/deactivating is admin-only; any staff member can read it (needed
    for document-creation dropdowns and the workflow monitoring screens).
    """
    queryset = DocumentType.objects.all()

    def get_permissions(self):
        return [IsStaffUser()] if self.request.method == 'GET' else [IsAdmin()]

    def get_serializer_class(self):
        return DocumentTypeSerializer if self.request.method == 'GET' else DocumentTypeWriteSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DocumentTypeSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.documents.exists():
            return Response(
                {"detail": "Cannot delete a document type already in use by existing documents. Deactivate it instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class DocumentTypeStepsView(APIView):
    """
    PUT /api/documents/types/<id>/steps/
    Body: { "steps": [ {step_number, office (Office id), action_required, max_hours_allowed}, ... ] }

    Atomically replaces the full ordered WorkflowStep list for a document
    type — this is what the Workflow Builder's "Save Workflow" button calls.
    step_number values are validated as sequential from 1 with no gaps or
    duplicates. On success, DocumentType.route is regenerated from the new
    steps, which is what the release/receive/return engine actually runs on.
    """
    permission_classes = [IsAdmin]

    def put(self, request, pk):
        try:
            document_type = DocumentType.objects.get(pk=pk)
        except DocumentType.DoesNotExist:
            return Response({"detail": "Document type not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkflowStepsReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        steps_data = sorted(serializer.validated_data['steps'], key=lambda s: s['step_number'])

        with transaction.atomic():
            document_type.steps.all().delete()
            WorkflowStep.objects.bulk_create([
                WorkflowStep(document_type=document_type, **step) for step in steps_data
            ])
            document_type.sync_route_from_steps()

        return Response(DocumentTypeSerializer(document_type).data)


class DocumentPagination(PageNumberPagination):
    page_size = 10


class DocumentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/documents/           list all documents (staff only)
    POST /api/documents/           create a new document (first office logs the request)
    """
    permission_classes = [IsStaffUser]
    pagination_class = DocumentPagination

    def get_queryset(self):
        # select/prefetch what DocumentSerializer's step_statuses/dwell_display/
        # document_type_steps fields touch per row, so the outer table's color
        # pill + dwell time don't turn into an N+1 query per document.
        qs = (
            Document.objects
            .select_related('document_type', 'current_handler')
            .prefetch_related('document_type__steps__office')
            .order_by('-created_at')
        )
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        office_param = self.request.query_params.get('office')
        if office_param:
            qs = qs.filter(current_office=office_param)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CreateDocumentSerializer
        return DocumentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        try:
            document = serializer.save()
        except IntegrityError:
            # Never let a raw DB error (or Django's DEBUG-mode HTML 500 page)
            # reach the client — the frontend can't parse it, and it would
            # leak internal details. serializer.is_valid() above already
            # caught every expected validation problem; anything that still
            # raises here is unexpected, so fail closed with a plain message
            # rather than a stack trace.
            return Response(
                {"detail": "We couldn't save your document request. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(DocumentDetailSerializer(document).data, status=status.HTTP_201_CREATED)


def _delete_document_and_log(request, document):
    """
    Shared by DocumentDetailView and MyDocumentDetailView's DELETE handler.
    Hard-deletes the document and records it in AccessLog rather than
    DocumentLog — DocumentLog rows CASCADE-delete with their Document, which
    would erase the very record of this action along with the document
    itself; AccessLog is tied to the acting user instead, so it survives.
    """
    detail = f"Deleted {document.tracking_number} ({document.document_type.name})"
    document.delete()
    AccessLog.objects.create(
        user=request.user, action=AccessLog.Action.DELETE_DOCUMENT, detail=detail,
        ip_address=_client_ip(request), user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
    )


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/documents/<id>/   full detail INCLUDING history log
    DELETE /api/documents/<id>/   staff/admin delete — only while the
                                   document is still untouched at its origin
                                   office (see services.py::can_delete_document),
                                   unless the requester is an admin (override).
    """
    queryset = Document.objects.all()
    serializer_class = DocumentDetailSerializer
    permission_classes = [IsStaffUser]

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        if not can_delete_document(document, request.user):
            return Response(
                {"detail": "This document can no longer be deleted — it has already been processed by an office."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _delete_document_and_log(request, document)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyDocumentListView(generics.ListAPIView):
    """
    GET /api/documents/mine/
    A registered citizen's own request history — view/print/download only,
    no edit access (that stays staff-only via DocumentListCreateView).
    """
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = DocumentPagination

    def get_queryset(self):
        return (
            Document.objects
            .filter(requested_by=self.request.user)
            .select_related('document_type', 'current_handler')
            .prefetch_related('document_type__steps__office')
            .order_by('-created_at')
        )


class MyDocumentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/documents/mine/<id>/   full detail (history log) for one of
                                        the citizen's own documents — powers
                                        their read-only "print / download"
                                        record view.
    DELETE /api/documents/mine/<id>/   citizen cancels their own request —
                                        only while it's still untouched at
                                        its origin office (no admin override
                                        here; this is the citizen's own
                                        endpoint).
    Scoped to requested_by=request.user, so a citizen can't view/print/
    delete someone else's document by guessing an id.
    """
    serializer_class = DocumentDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(requested_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        if not can_delete_document(document, request.user):
            return Response(
                {"detail": "This request can no longer be cancelled — it has already been processed by an office."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _delete_document_and_log(request, document)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentCitizenReturnView(APIView):
    """
    PATCH /api/documents/<id>/citizen-return/
    A citizen sending a RELEASED document of theirs back to the office that
    released it, with a required reason (see
    services.py::citizen_return_document()). Ownership is checked here
    (403) rather than in the service, so an attempt on someone else's
    document gets a clean permissions error instead of a generic 400.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        if document.requested_by_id != request.user.id:
            return Response({"detail": "You can only return your own document requests."}, status=status.HTTP_403_FORBIDDEN)

        notes = request.data.get('notes', '')

        try:
            updated = citizen_return_document(document, citizen_user=request.user, notes=notes)
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(DocumentDetailSerializer(updated).data)


class DocumentExpediteView(APIView):
    """
    POST /api/documents/<id>/expedite/
    A citizen flagging their own delayed document request for staff
    attention — the "Follow-Up / Expedite Request" button (see
    services.py::expedite_document()). Ownership is checked here (403)
    rather than in the service, same convention as
    DocumentCitizenReturnView above.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        if document.requested_by_id != request.user.id:
            return Response({"detail": "You can only request a follow-up on your own document requests."}, status=status.HTTP_403_FORBIDDEN)

        try:
            expedite_document(document, citizen_user=request.user)
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Follow-up request sent to the office currently handling your document."})


def _resolve_official_file(document):
    """
    The file DocumentOfficialFileView/PublicDocumentOfficialFileView should
    serve: the Staff/Admin-filled GeneratedDocument if one has actually been
    generated for this specific request, otherwise the blank
    DocumentType.template_file exactly as before. Never touches
    DocumentType.template_file itself, so other requests of the same type
    are unaffected either way.
    """
    generated = getattr(document, 'generated_document', None)
    if generated and generated.status == GeneratedDocument.Status.GENERATED and generated.generated_file:
        return generated.generated_file
    return document.document_type.template_file


class DocumentOfficialFileView(APIView):
    """
    GET /api/documents/<id>/official-file/
    Streams the REAL official file for this document — the Staff/Admin-
    filled version if one exists, else the blank DocumentType.template_file.
    Staff can preview it anytime (QA / prep before release); the requesting
    citizen can only reach it once the document has actually been Released,
    matching the "documents can ONLY be accessed when status = Released"
    access rule.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(Document, pk=pk)
        user = request.user
        is_staff = user.role in ('admin', 'employee')
        is_owner = document.requested_by_id == user.id

        if not (is_staff or is_owner):
            return Response({"detail": "You don't have access to this document."}, status=status.HTTP_403_FORBIDDEN)

        if not is_staff and document.status != Document.Status.RELEASED:
            return Response({"detail": "This document hasn't been released yet."}, status=status.HTTP_403_FORBIDDEN)

        official_file = _resolve_official_file(document)
        if not official_file:
            return Response(
                {"detail": "No official file has been uploaded for this document type yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(official_file.open('rb'), content_type='application/pdf', as_attachment=False, filename=official_file.name.rsplit('/', 1)[-1])


class PublicDocumentOfficialFileView(APIView):
    """
    GET /api/documents/track/<tracking_number>/official-file/
    Same file, reachable with no account — matches the guest tracking tier.
    No Authorization header involved (unlike DocumentOfficialFileView), so
    this is the one safe to link/embed directly from the public Track page.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'public-track'

    def get(self, request, tracking_number):
        document = get_object_or_404(Document, tracking_number=tracking_number)
        enforce_scope_access(document, request.user)

        if document.status != Document.Status.RELEASED:
            return Response({"detail": "This document hasn't been released yet."}, status=status.HTTP_403_FORBIDDEN)

        official_file = _resolve_official_file(document)
        if not official_file:
            return Response(
                {"detail": "No official file has been uploaded for this document type yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(official_file.open('rb'), content_type='application/pdf', as_attachment=False, filename=official_file.name.rsplit('/', 1)[-1])


def _effective_field_values(document):
    """
    The values GeneratedDocumentView / DocumentGenerateModal.jsx should show
    when a Staff/Admin user opens a request's fill form: whatever's already
    been saved as a draft, with any still-unset field auto-populated from
    the citizen's original request (Document.form_data) via
    DocumentTemplateField.source_request_key — so staff are never asked to
    retype data that's already on file. A NAME field is deliberately never
    auto-populated this way even if source_request_key is set: the original
    request typically stores one combined string, and there's no reliable
    way to split that into first/middle/last/suffix — see
    _name_reference_values() below for how staff still get to see it.
    """
    generated = getattr(document, 'generated_document', None)
    saved_values = generated.field_values if generated else {}

    values = {}
    for field in document.document_type.template_fields.all():
        if field.key in saved_values:
            values[field.key] = saved_values[field.key]
        elif field.field_type == DocumentTemplateField.FieldType.NAME:
            values[field.key] = {}
        elif field.source_request_key:
            values[field.key] = document.form_data.get(field.source_request_key) or field.default_value
        else:
            values[field.key] = field.default_value
    return values


def _name_reference_values(document):
    """
    For every NAME-type template field with a source_request_key, the
    citizen's original combined-name string (if any) on their request —
    shown by DocumentGenerateModal.jsx as a read-only reference next to the
    blank First/Middle/Last/Suffix inputs so staff can copy the right
    pieces across, without the system guessing how to split it.
    """
    result = {}
    for field in document.document_type.template_fields.all():
        if field.field_type == DocumentTemplateField.FieldType.NAME and field.source_request_key:
            original = document.form_data.get(field.source_request_key)
            if original:
                result[field.key] = original
    return result


def _field_has_value(field, value):
    """
    Whether `value` counts as "filled in" for this field's required-ness
    check — a NAME field needs at least a first and last name (suffix is
    always optional); everything else just needs a non-blank value. A
    legacy plain-string value on a NAME field (from before it became
    composite — see the model's docstring) counts as filled if non-blank,
    consistent with document_generation.py rendering it as-is.
    """
    if field.field_type == DocumentTemplateField.FieldType.NAME:
        if not isinstance(value, dict):
            return bool(value and str(value).strip())
        return bool((value.get('first') or '').strip()) and bool((value.get('last') or '').strip())
    return value is not None and str(value).strip() != ''


class GeneratedDocumentView(APIView):
    """
    GET  /api/documents/<id>/generated-document/   current fill-form state
    PUT  /api/documents/<id>/generated-document/    save as a draft (no
                                                     file render — that's
                                                     GenerateDocumentView)
    Staff/Admin only. Citizens never reach this — they only ever see the
    read-only final result via DocumentOfficialFileView once it's Generated
    and the request is Released.
    """
    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        document = get_object_or_404(Document, pk=pk)
        generated = getattr(document, 'generated_document', None)
        return Response({
            'field_values': _effective_field_values(document),
            'name_reference_values': _name_reference_values(document),
            'status': generated.status if generated else GeneratedDocument.Status.DRAFT,
            'status_label': generated.get_status_display() if generated else 'Draft',
            'updated_at': generated.updated_at if generated else None,
        })

    def put(self, request, pk):
        document = get_object_or_404(Document, pk=pk)
        generated, _ = GeneratedDocument.objects.get_or_create(
            document=document, defaults={'created_by': request.user},
        )
        generated.field_values = request.data.get('field_values', {})
        generated.updated_by = request.user
        generated.save(update_fields=['field_values', 'updated_by', 'updated_at'])
        return Response(GeneratedDocumentSerializer(generated).data)


class GenerateDocumentView(APIView):
    """
    POST /api/documents/<id>/generated-document/generate/
    Body: { "field_values": {...} }
    Renders the official document with the given values overlaid onto
    DocumentType.template_file (see document_generation.py) and, unless
    ?preview=true, saves it as this request's GeneratedDocument — the
    "Generate Document" / "Update Document" action (same endpoint; the
    button just relabels itself based on current status). Staff/Admin only.
    """
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        document = get_object_or_404(Document, pk=pk)
        if not document.document_type.template_file:
            return Response(
                {"detail": "No official file has been uploaded for this document type yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        field_values = request.data.get('field_values', {})
        is_preview = request.query_params.get('preview') == 'true'

        # Required-field validation gates the real Generate/Update action
        # only — a preview stays available with partial data so staff can
        # check positioning/formatting before everything is filled in.
        if not is_preview:
            missing_labels = [
                f.label for f in document.document_type.template_fields.all()
                if f.required and not _field_has_value(f, field_values.get(f.key))
            ]
            if missing_labels:
                return Response(
                    {"detail": f"Please fill in: {', '.join(missing_labels)}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            pdf_bytes = render_generated_document(document, field_values)
        except Exception:
            return Response(
                {"detail": "We couldn't generate the document. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if is_preview:
            return FileResponse(io.BytesIO(pdf_bytes), content_type='application/pdf', as_attachment=False, filename='preview.pdf')

        generated, _ = GeneratedDocument.objects.get_or_create(
            document=document, defaults={'created_by': request.user},
        )
        # Storage never overwrites a same-named file (it appends a random
        # suffix instead), so without this, every "Update Document" leaves
        # the previous render orphaned on disk forever. Delete it first.
        if generated.generated_file:
            generated.generated_file.delete(save=False)
        generated.field_values = field_values
        generated.status = GeneratedDocument.Status.GENERATED
        generated.updated_by = request.user
        generated.generated_file.save(
            f"{document.tracking_number}.pdf", ContentFile(pdf_bytes), save=False,
        )
        generated.save()
        return Response(GeneratedDocumentSerializer(generated).data)


def _document_route_offices(document):
    """Route office codes resolved to real Office rows, de-duplicated — an
    office appearing twice in a route is only ever rated once per document."""
    seen_ids = set()
    offices = []
    for code in document.document_type.route:
        office = resolve_office(code)
        if office and office.id not in seen_ids:
            seen_ids.add(office.id)
            offices.append(office)
    return offices


def _active_evaluation_survey():
    return Survey.objects.filter(is_active=True).prefetch_related('questions').first()


def _evaluation_get(document):
    """
    Shared by DocumentEvaluationView (logged-in owner, by id) and
    PublicDocumentEvaluationView (anyone with the tracking number, no
    account needed) — "already rated" is scoped to the document/office pair
    itself, not to who's asking, since only one evaluation exists per office
    per document however it was submitted.
    """
    survey = _active_evaluation_survey()
    if not survey:
        return Response({"survey": None, "offices": []})

    rated_office_ids = set(
        SurveyResponse.objects.filter(document=document).values_list('office_id', flat=True)
    )
    return Response({
        "survey": SurveySerializer(survey).data,
        "offices": [
            {"id": o.id, "name": o.name, "code": o.code, "already_rated": o.id in rated_office_ids}
            for o in _document_route_offices(document)
        ],
    })


def _evaluation_post(request, document, respondent):
    survey = _active_evaluation_survey()
    if not survey:
        return Response({"detail": "No active evaluation form is configured."}, status=status.HTTP_400_BAD_REQUEST)

    questions_by_id = {q.id: q for q in survey.questions.all()}
    offices_by_id = {o.id: o for o in _document_route_offices(document)}
    already_rated_ids = set(
        SurveyResponse.objects.filter(document=document).values_list('office_id', flat=True)
    )

    office_ratings = request.data.get('office_ratings', [])
    if not isinstance(office_ratings, list) or not office_ratings:
        return Response({"detail": "office_ratings is required."}, status=status.HTTP_400_BAD_REQUEST)

    saved = 0
    for entry in office_ratings:
        office_id = entry.get('office')
        if office_id not in offices_by_id or office_id in already_rated_ids:
            # Not part of this document's route, or already rated —
            # skip silently rather than fail the whole batch.
            continue

        answers = entry.get('answers', [])
        seen_question_ids = set()
        for answer in answers:
            question = questions_by_id.get(answer.get('question'))
            if question is None or question.id in seen_question_ids:
                return Response({"detail": "Invalid or duplicate answer for this evaluation."}, status=status.HTTP_400_BAD_REQUEST)
            seen_question_ids.add(question.id)
            if question.question_type == SurveyQuestion.QuestionType.RATING and answer.get('rating_value') is None:
                return Response({"detail": f"'{question.text}' requires a star rating."}, status=status.HTTP_400_BAD_REQUEST)

        missing = set(questions_by_id) - seen_question_ids
        if missing:
            return Response({"detail": "Please answer every question for each office."}, status=status.HTTP_400_BAD_REQUEST)

        # A guest and the account holder racing to rate the same office
        # both pass the already_rated_ids check above before either commits
        # — the DB's unique_evaluation_per_document_office constraint is the
        # real backstop, so the loser of that race is skipped, not errored.
        try:
            with transaction.atomic():
                response = SurveyResponse.objects.create(
                    survey=survey, respondent=respondent, document=document, office=offices_by_id[office_id],
                )
        except IntegrityError:
            continue
        SurveyAnswer.objects.bulk_create([
            SurveyAnswer(
                response=response, question_id=answer['question'],
                rating_value=answer.get('rating_value'), text_value=answer.get('text_value', ''),
            )
            for answer in answers
        ])
        saved += 1

    if saved == 0:
        return Response({"detail": "Nothing new to save — those offices are already rated."}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {"detail": f"Thank you! Your evaluation for {saved} office{'s' if saved != 1 else ''} has been recorded."},
        status=status.HTTP_201_CREATED,
    )


class DocumentEvaluationView(APIView):
    """
    GET  /api/documents/<id>/evaluation/   what's left to rate
    POST /api/documents/<id>/evaluation/   submit ratings

    A logged-in citizen evaluating one of THEIR OWN documents, broken out
    PER OFFICE that actually touched it — so a bad experience at one office
    doesn't drag down another office's KPI. Only reachable by the citizen
    who requested the document, and only once it has actually been handed
    back to them. Guests without an account use PublicDocumentEvaluationView
    instead, by tracking number.
    """
    permission_classes = [IsAuthenticated]

    def _get_document(self, request, pk):
        try:
            document = Document.objects.select_related('document_type').get(pk=pk)
        except Document.DoesNotExist:
            raise NotFound("Document not found.")
        if document.requested_by_id != request.user.id:
            raise NotFound("Document not found.")
        if document.status != Document.Status.RELEASED:
            raise ValidationError("This document hasn't been released to you yet.")
        return document

    def get(self, request, pk):
        return _evaluation_get(self._get_document(request, pk))

    def post(self, request, pk):
        document = self._get_document(request, pk)
        return _evaluation_post(request, document, request.user)


class PublicDocumentEvaluationView(APIView):
    """
    GET  /api/documents/track/<tracking_number>/evaluation/
    POST /api/documents/track/<tracking_number>/evaluation/

    Same per-office evaluation as DocumentEvaluationView, but reachable by
    tracking number with no account required — mirrors
    DocumentTrackingLookupView's public-lookup model (still refuses INTERNAL
    documents to non-staff). Whoever holds the tracking number is trusted to
    be the recipient, same as the public Track page itself; the DB's
    (document, office) uniqueness is what actually stops double-rating, not
    an ownership check.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'public-track'

    def _get_document(self, request, tracking_number):
        try:
            document = Document.objects.select_related('document_type').get(tracking_number=tracking_number)
        except Document.DoesNotExist:
            raise NotFound("Document not found.")
        enforce_scope_access(document, request.user)
        if document.status != Document.Status.RELEASED:
            raise ValidationError("This document hasn't been released yet.")
        return document

    def get(self, request, tracking_number):
        return _evaluation_get(self._get_document(request, tracking_number))

    def post(self, request, tracking_number):
        document = self._get_document(request, tracking_number)
        respondent = request.user if request.user.is_authenticated else None
        return _evaluation_post(request, document, respondent)


class DocumentTrackingLookupView(generics.RetrieveAPIView):
    """
    GET /api/documents/track/<tracking_number>/
    Public-ish lookup by tracking number — for citizen follow-up,
    matches adviser's note: 'way na makapag follow up si citizen'.
    Works whether or not the citizen registered an account.

    Anyone who merely knows/guesses a tracking number only ever gets the
    lean PublicDocumentTrackingSerializer (status/timeline, no form_data,
    no requested-by identity, no staff names) — staff get the full detail
    they already see elsewhere (this view isn't how they'd normally reach a
    document, but the role check is here for consistency/safety anyway).
    """
    queryset = Document.objects.all()
    lookup_field = 'tracking_number'
    permission_classes = [AllowAny]
    throttle_scope = 'public-track'

    def get_serializer_class(self):
        user = self.request.user
        is_staff = bool(user and user.is_authenticated and getattr(user, 'role', None) in ('admin', 'employee'))
        return DocumentDetailSerializer if is_staff else PublicDocumentTrackingSerializer

    def get_object(self):
        document = super().get_object()
        enforce_scope_access(document, self.request.user)
        return document


class QRScanResolveView(APIView):
    """
    POST /api/documents/qr/scan/
    Body: { "payload": "<raw scanned string, or a manually-typed tracking number>" }

    Single role-aware entry point for "what should happen when this QR gets
    scanned": verifies the payload's signature, then branches on who is
    asking.
      - Staff (admin/employee): full document detail plus scan_context
        (suggested action, current step, dwell time, time spent at the
        previous office) — exactly what EmployeeQRScanner needs to open the
        Receive/Return confirmation modal pre-filled, with no second request.
      - Citizen / guest, EXTERNAL document: the same public-safe detail the
        tracking page renders.
      - Citizen / guest, INTERNAL document: refused with the fixed
        "internal municipal document" message before any detail is
        serialized into the response.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'public-track'

    def post(self, request):
        payload = request.data.get('payload', '')
        document = resolve_and_verify(payload)
        enforce_scope_access(document, request.user)

        user = request.user
        is_staff = bool(user and user.is_authenticated and getattr(user, 'role', None) in ('admin', 'employee'))

        if is_staff:
            return Response({
                'role': 'staff',
                'document': DocumentDetailSerializer(document).data,
                'scan_context': build_scan_context(document),
            })

        payload = {
            'role': 'public',
            'document': PublicDocumentTrackingSerializer(document).data,
        }

        # A logged-in citizen scanning THEIR OWN document gets the automated
        # post-scan survey surfaced right here, so CitizenQRScanView.jsx can
        # pop the survey modal without a second lookup. Guests and citizens
        # scanning someone else's tag never see it.
        is_owner_citizen = bool(
            user and user.is_authenticated
            and getattr(user, 'role', None) == 'citizen'
            and document.requested_by_id == user.id
        )
        if is_owner_citizen:
            survey = _active_evaluation_survey()
            if survey:
                payload['post_scan_survey'] = {
                    'document_id': document.id,
                    'already_submitted': SurveyResponse.objects.filter(
                        survey=survey, document=document, respondent=user,
                        source=SurveyResponse.Source.POST_SCAN,
                    ).exists(),
                }

        return Response(payload)


class DocumentScanView(APIView):
    """
    PATCH /api/documents/<id>/scan/
    Manual (non-QR) override for staff — same release/receive mechanics as
    the QR transfer endpoint, minus qr_verified. Body: { action: 'release' | 'receive' | 'return_to_office', office, notes }
    `office` is only used for 'receive' (defaults to the scanning user's own office);
    'release' and 'return_to_office' always target the document's current
    office and need no office param — return_to_office's destination (the
    previous office in the route) is computed automatically by
    return_document(), not chosen by the caller.
    """
    permission_classes = [IsStaffUser]

    def patch(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action', 'receive')
        notes = request.data.get('notes', '')

        try:
            if action == 'release':
                updated = release_document(document, releasing_user=request.user, notes=notes)
            elif action == 'return_to_office':
                updated = return_document(document, returning_user=request.user, notes=notes)
            else:
                office = request.data.get('office') or request.user.office
                if not office:
                    return Response({"office": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)
                updated = receive_document(document, scanning_user=request.user, scanning_office=office, notes=notes)
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(DocumentDetailSerializer(updated).data)

class DocumentTransferView(APIView):
    """
    POST /api/documents/transfer/
    Body: { "qr_payload": "<raw scanned string>", "action": "release" | "receive" | "return", "notes": "" }

    Single entry point for the Controlled Return/Receive module. Staff pick
    an intent in the UI, scan a document's QR code with their device camera,
    and this endpoint resolves the tracking number from the payload, checks
    the scanning user is allowed to act on this document, then does one of:
      - "release": the sending office scans the document OUT toward the next
        office in its route (Document goes In Transit).
      - "receive": the next office scans it IN, which only succeeds if it was
        actually released first — this is the receive/release order control.
      - "return": once Completed at its origin office, hands it back to the
        citizen.
    Every resulting DocumentLog is stamped qr_verified=True, since this path
    is only reachable via a decoded QR scan (contrast with the manual
    office-entry form behind DocumentScanView).
    """
    permission_classes = [IsStaffUser]

    def post(self, request):
        serializer = DocumentTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tracking_number = serializer.get_tracking_number()
        action = serializer.validated_data['action']
        notes = serializer.validated_data['notes']

        if not tracking_number:
            return Response({"detail": "Could not read a tracking number from that QR code."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            document = Document.objects.get(tracking_number=tracking_number)
        except Document.DoesNotExist:
            return Response({"detail": "No document matches this QR code."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.office:
            return Response(
                {"detail": "Your account has no office assigned. Contact an admin before scanning documents."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if action == 'release':
                updated = release_document(document, releasing_user=request.user, notes=notes, qr_verified=True)
                next_office = document.document_type.route[document.route_position + 1]
                message = f"{updated.tracking_number} released — awaiting receipt at {next_office}."
            elif action == 'return':
                updated, email_status = release_to_citizen(document, releasing_user=request.user, notes=notes, qr_verified=True)
                message = f"{updated.tracking_number} released to the citizen."
                if email_status == 'sent':
                    message += " Notification email sent."
                elif email_status == 'already_sent':
                    message += " Citizen was already notified earlier."
                elif email_status == 'skipped':
                    message += " No email on file for this citizen — notification not sent."
                elif email_status == 'failed':
                    message += " Notification email failed to send — please follow up."
            else:
                updated = receive_document(
                    document, scanning_user=request.user, scanning_office=request.user.office,
                    notes=notes, qr_verified=True,
                )
                verb = 'returned to origin at' if updated.status == Document.Status.COMPLETED else 'received at'
                message = f"{updated.tracking_number} {verb} {updated.current_office}."
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": message, "document": DocumentDetailSerializer(updated).data})


class DocumentReleaseView(APIView):
    """
    PATCH /api/documents/<id>/release/
    Backs the "Release to Citizen" button — called by the origin office
    once a Completed document is physically handed back to the citizen.
    Adds `email_status` ('sent'/'failed'/'skipped'/'already_sent') to the
    response alongside the usual document payload, so the frontend can show
    staff a truthful outcome (e.g. "Document released and notification
    email sent successfully." vs "...but the notification email failed.")
    instead of assuming the email always goes out.
    """
    permission_classes = [IsStaffUser]

    def patch(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        notes = request.data.get('notes', '')

        try:
            updated, email_status = release_to_citizen(document, releasing_user=request.user, notes=notes)
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        data = DocumentDetailSerializer(updated).data
        data['email_status'] = email_status
        return Response(data)


class DocumentFlagMissingView(APIView):
    """
    PATCH /api/documents/<id>/flag-missing/
    """
    permission_classes = [IsStaffUser]

    def patch(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        notes = request.data.get('notes', '')

        try:
            updated = flag_missing(document, flagging_user=request.user, notes=notes)
        except ValidationError as e:
            return Response({"detail": str(e.detail[0]) if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(DocumentDetailSerializer(updated).data)


class DocumentStageUpdateView(APIView):
    """
    PATCH /api/documents/<id>/stage/
    Body: { "stage": "<ProcessingStage value>", "note": "" }

    Staff-authored update to the citizen-facing processing-stage narrative
    (Document.ProcessingStage) — independent of Document.status and the
    physical release/receive/return engine, which staff keep working with
    exactly as before via the scan/transfer endpoints. Forward-only along
    STAGE_ORDER (mirrors a real approval pipeline — no un-approving by
    PATCHing backwards), except 'rejected', which is reachable as a
    terminal outcome from any non-terminal stage.
    """
    permission_classes = [IsStaffUser]

    STAGE_ORDER = [
        Document.ProcessingStage.SUBMITTED,
        Document.ProcessingStage.UNDER_REVIEW,
        Document.ProcessingStage.VERIFICATION,
        Document.ProcessingStage.FORM_PROCESSING,
        Document.ProcessingStage.FOR_APPROVAL,
        Document.ProcessingStage.APPROVED,
        Document.ProcessingStage.DOCUMENT_GENERATED,
        Document.ProcessingStage.SOFT_COPY_AVAILABLE,
        Document.ProcessingStage.READY_FOR_RELEASE,
        Document.ProcessingStage.COMPLETED,
    ]
    TERMINAL_STAGES = {Document.ProcessingStage.COMPLETED, Document.ProcessingStage.REJECTED}

    def patch(self, request, pk):
        try:
            document = Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        stage = request.data.get('stage')
        note = request.data.get('note', '')
        valid_stages = {choice.value for choice in Document.ProcessingStage}
        if stage not in valid_stages:
            return Response({"detail": "Invalid stage."}, status=status.HTTP_400_BAD_REQUEST)

        if document.processing_stage in self.TERMINAL_STAGES:
            return Response(
                {"detail": f"This request is already '{document.get_processing_stage_display()}' and can't be moved further."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if stage != Document.ProcessingStage.REJECTED:
            current_index = self.STAGE_ORDER.index(document.processing_stage) if document.processing_stage in self.STAGE_ORDER else -1
            new_index = self.STAGE_ORDER.index(stage)
            if new_index <= current_index:
                return Response({"detail": "Stage can only move forward."}, status=status.HTTP_400_BAD_REQUEST)

        advance_processing_stage(document, stage, actor=request.user, note=note)
        return Response(DocumentDetailSerializer(document).data)


def _office_rating_stats():
    """
    Average citizen-satisfaction rating per office, computed from
    SurveyAnswer.rating_value on RATING-type questions attached to a
    per-document, per-office evaluation (see DocumentEvaluationView) —
    the citizen feedback KPI, independent of processing speed. Highest
    rated first.
    """
    rows = (
        SurveyAnswer.objects
        .filter(
            question__question_type=SurveyQuestion.QuestionType.RATING,
            rating_value__isnull=False,
            response__office__isnull=False,
        )
        .values('response__office__code', 'response__office__name')
        .annotate(avg_rating=Avg('rating_value'), rating_count=Count('id'))
        .order_by('-avg_rating')
    )
    return [
        {
            "office": row['response__office__code'],
            "office_name": row['response__office__name'],
            "avg_rating": round(row['avg_rating'], 2),
            "rating_count": row['rating_count'],
        }
        for row in rows
    ]


def _office_speed_stats():
    """
    Shared by AdminDashboardStatsView and HeatmapDataView: average
    duration_at_office per office, grouped by office code, fastest first.
    Each row also carries that office's avg_rating/rating_count from
    _office_rating_stats(), so the heatmap and Top 5 lists can show
    citizen satisfaction alongside processing speed without a second call.
    """
    stats = (
        DocumentLog.objects
        .exclude(duration_at_office__isnull=True)
        .exclude(office__isnull=True)
        .values('office__code', 'office__name')
        .annotate(avg_time=Avg('duration_at_office'), doc_count=Count('id'))
        .order_by('avg_time')
    )
    rating_by_office = {row['office']: row for row in _office_rating_stats()}
    return [
        {
            "office": item['office__code'],
            "office_name": item['office__name'],
            "avg_hours": round(item['avg_time'].total_seconds() / 3600, 2),
            "count": item['doc_count'],
            "avg_rating": rating_by_office.get(item['office__code'], {}).get('avg_rating'),
            "rating_count": rating_by_office.get(item['office__code'], {}).get('rating_count', 0),
        }
        for item in stats
    ]


class AdminDashboardStatsView(APIView):
    """
    GET /api/documents/dashboard-stats/?scan_days=14&bottleneck_hours=48
    Powers the Admin Analytics Dashboard. Deliberately kept as ONE endpoint
    rather than a separate /api/admin/analytics/ — it already owned the
    status counters/period counts/per-type demand/office-speed rankings, and
    splitting the newer KPI-engine fields (workload, resolution time, scan
    timeline, audit breakdown, bottlenecks) into a second endpoint would just
    mean two round trips returning overlapping data for the same page.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        now = timezone.now()
        total = Document.objects.count()
        pending = Document.objects.filter(status__in=['in_progress', 'in_transit']).count()
        completed = Document.objects.filter(status='completed').count()
        released = Document.objects.filter(status='released').count()
        missing = Document.objects.filter(status='missing').count()

        week_start = now - timedelta(days=7)
        prev_week_start = now - timedelta(days=14)
        this_week_count = Document.objects.filter(created_at__gte=week_start).count()
        prev_week_count = Document.objects.filter(created_at__gte=prev_week_start, created_at__lt=week_start).count()
        weekly_trend_pct = (
            round((this_week_count - prev_week_count) / prev_week_count * 100, 1)
            if prev_week_count else None
        )

        by_period = {
            "daily": Document.objects.filter(created_at__date=timezone.localdate()).count(),
            "weekly": this_week_count,
            "monthly": Document.objects.filter(created_at__gte=now - timedelta(days=30)).count(),
            "yearly": Document.objects.filter(created_at__year=now.year).count(),
        }

        by_type = [
            {"name": row['document_type__name'], "count": row['count']}
            for row in (
                Document.objects.values('document_type__name')
                .annotate(count=Count('id'))
                .order_by('-count')
            )
        ]

        office_stats = _office_speed_stats()
        rating_stats = _office_rating_stats()

        # Office workload — currently-active (not yet done) documents sitting
        # at each office right now, distinct from office_stats above (which
        # is a historical average speed, not a live headcount).
        office_workload = [
            {"office": row['current_office'], "count": row['count']}
            for row in (
                Document.objects.filter(status__in=['in_progress', 'in_transit'])
                .exclude(current_office='')
                .values('current_office')
                .annotate(count=Count('id'))
                .order_by('-count')
            )
        ]

        # Average resolution time: creation -> the log that actually finished
        # the route (RETURNED, the "back at origin" completion action) or
        # handed the document to the citizen (RELEASED_TO_CITIZEN) —
        # whichever happened for that document. NOT based on `updated_at`,
        # which just reflects whenever the row was last touched.
        completion_log = DocumentLog.objects.filter(
            document=OuterRef('pk'),
            action__in=[DocumentLog.Action.RETURNED, DocumentLog.Action.RELEASED_TO_CITIZEN],
        ).order_by('-timestamp')
        resolved_docs = (
            Document.objects.filter(status__in=['completed', 'released'])
            .annotate(completed_at=Subquery(completion_log.values('timestamp')[:1]))
            .exclude(completed_at__isnull=True)
            .annotate(resolution_time=ExpressionWrapper(F('completed_at') - F('created_at'), output_field=DurationField()))
        )
        avg_resolution = resolved_docs.aggregate(avg=Avg('resolution_time'))['avg']
        avg_resolution_hours = round(avg_resolution.total_seconds() / 3600, 1) if avg_resolution else None
        avg_resolution_display = None
        if avg_resolution_hours is not None:
            avg_resolution_display = (
                f"{round(avg_resolution_hours / 24, 1)} days" if avg_resolution_hours >= 24
                else f"{avg_resolution_hours} hours"
            )

        # Peak scan activity — QR-verified movements per day, most recent
        # `scan_days` days (default 14).
        scan_days = int(request.query_params.get('scan_days', 14))
        scan_since = now - timedelta(days=scan_days)
        scan_timeline = list(
            DocumentLog.objects.filter(qr_verified=True, timestamp__gte=scan_since)
            .annotate(day=TruncDate('timestamp'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        scan_timeline = [{"date": row['day'].isoformat(), "count": row['count']} for row in scan_timeline]

        # Audit trail (AccessLog) action breakdown. Only login/login_failed
        # are actually wired to be created anywhere right now — the other
        # AccessLog.Action choices exist on the model but nothing writes
        # them yet, so they'll legitimately show 0 until that's built.
        access_log_breakdown = [
            {"action": row['action'], "label": AccessLog.Action(row['action']).label, "count": row['count']}
            for row in AccessLog.objects.values('action').annotate(count=Count('id')).order_by('-count')
        ]
        access_logs_today = AccessLog.objects.filter(timestamp__date=timezone.localdate()).count()

        # Bottleneck / high-priority alert widget — active documents that
        # have sat at their current office past a threshold (default 48h).
        bottleneck_hours = int(request.query_params.get('bottleneck_hours', 48))
        bottleneck_cutoff = now - timedelta(hours=bottleneck_hours)
        bottlenecks = []
        stuck_qs = (
            Document.objects.filter(status__in=['in_progress', 'in_transit'], entered_current_office_at__lte=bottleneck_cutoff)
            .select_related('document_type', 'current_handler')
            .order_by('entered_current_office_at')[:10]
        )
        for doc in stuck_qs:
            dwell_hours = (now - doc.entered_current_office_at).total_seconds() / 3600
            bottlenecks.append({
                "id": doc.id,
                "tracking_number": doc.tracking_number,
                "document_type_name": doc.document_type.name,
                "current_office": doc.current_office,
                "status": doc.status,
                "dwell_hours": round(dwell_hours, 1),
                "handler": doc.current_handler.full_name if doc.current_handler else None,
            })

        return Response({
            "total": total,
            "pending": pending,
            "completed": completed,
            "released": released,
            "missing": missing,
            "missing_rate_pct": round(missing / total * 100, 1) if total else 0,
            "weekly_trend_pct": weekly_trend_pct,
            "by_period": by_period,
            "by_type": by_type,
            "top5_fastest": office_stats[:5],
            "top5_slowest": list(reversed(office_stats))[:5],
            "top5_highest_rated": rating_stats[:5],
            "top5_lowest_rated": list(reversed(rating_stats))[:5],
            "office_workload": office_workload,
            "avg_resolution_hours": avg_resolution_hours,
            "avg_resolution_display": avg_resolution_display,
            "scan_timeline": scan_timeline,
            "access_log_breakdown": access_log_breakdown,
            "access_logs_today": access_logs_today,
            "bottlenecks": bottlenecks,
            "bottleneck_hours": bottleneck_hours,
        })

class MissingDocumentAlertListView(generics.ListAPIView):
    """
    GET /api/alerts/
    Feeds the admin dashboard's "flagged documents" panel. Populated by the
    check_missing_documents management command (run hourly via an OS-level
    scheduler). Defaults to active alerts only — pass ?status=resolved or
    ?status=all to see the rest.
    """
    serializer_class = MissingDocumentAlertSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = MissingDocumentAlert.objects.select_related('document', 'document__document_type', 'resolved_by')
        status_param = self.request.query_params.get('status', MissingDocumentAlert.Status.ACTIVE)
        if status_param != 'all':
            qs = qs.filter(status=status_param)
        return qs


class HeatmapDataView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(_office_speed_stats())


class MyOfficePerformanceView(APIView):
    """
    GET /api/documents/my-office-performance/
    Staff/employee equivalent of the Admin Dashboard's "Office Performance"
    (avg turnaround) and "Citizen Satisfaction" (avg rating) panels, scoped
    to just the requesting user's own office — no new aggregation, this
    just filters the same _office_speed_stats() rows those admin panels
    already use down to one office.
    """
    permission_classes = [IsStaffUser]

    def get(self, request):
        office = resolve_office(request.user.office)
        if not office:
            return Response({
                "office": None, "office_name": None,
                "avg_hours": None, "count": 0,
                "avg_rating": None, "rating_count": 0,
            })

        row = next((r for r in _office_speed_stats() if r['office'] == office.code), None)
        if not row:
            return Response({
                "office": office.code, "office_name": office.name,
                "avg_hours": None, "count": 0,
                "avg_rating": None, "rating_count": 0,
            })
        return Response(row)


class SurveyListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/documents/surveys/            active surveys only (public —
                                             Landing page + citizen portal),
                                             or ?all=true for every survey
                                             (admin Survey Manager)
    POST /api/documents/surveys/            admin creates a bare survey;
                                             questions are added afterward
                                             via .../<id>/questions/
    """

    def get_queryset(self):
        qs = Survey.objects.all()
        user = self.request.user
        is_admin = bool(user and user.is_authenticated and getattr(user, 'role', None) == 'admin')
        if not (is_admin and self.request.query_params.get('all') == 'true'):
            qs = qs.filter(is_active=True)
        return qs.prefetch_related('questions')

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [AllowAny()]

    def get_serializer_class(self):
        return SurveyWriteSerializer if self.request.method == 'POST' else SurveySerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        survey = serializer.save()
        return Response(SurveySerializer(survey).data, status=status.HTTP_201_CREATED)


class SurveyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/documents/surveys/<id>/
    Read is public (only if active, unless you're an admin); editing/
    deleting is admin-only.
    """
    queryset = Survey.objects.prefetch_related('questions')

    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAdmin()]

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        is_admin = bool(user and user.is_authenticated and getattr(user, 'role', None) == 'admin')
        if self.request.method == 'GET' and not obj.is_active and not is_admin:
            raise NotFound("Survey not found.")
        return obj

    def get_serializer_class(self):
        return SurveySerializer if self.request.method == 'GET' else SurveyWriteSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SurveySerializer(instance).data)


class SurveyQuestionsView(APIView):
    """
    PUT /api/documents/surveys/<id>/questions/
    Body: { "questions": [ {id?, order, text, question_type}, ... ] }
    Saves the full ordered question list — an UPSERT, not a delete-and-
    recreate: a question carrying its real `id` (SurveyBuilder.jsx sends
    this for every question that already existed) is updated in place, so
    its row's primary key — and therefore any SurveyAnswer history pointing
    at it — survives. Only a question genuinely dropped from the list (no
    longer present by id) actually gets deleted, which legitimately cascades
    away just that question's own historical answers.

    This replaced an earlier version that unconditionally did
    `survey.questions.all().delete()` before recreating everything from
    scratch — which meant EVERY save of a survey's questions (even fixing a
    typo, with nothing else changed) silently destroyed all past
    SurveyAnswer rows for that survey, because SurveyAnswer.question is a
    hard CASCADE foreign key. Reordering/editing a question no longer does
    that; only actually removing a question does.
    """
    permission_classes = [IsAdmin]

    def put(self, request, pk):
        try:
            survey = Survey.objects.get(pk=pk)
        except Survey.DoesNotExist:
            return Response({"detail": "Survey not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SurveyQuestionsReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        questions_data = sorted(serializer.validated_data['questions'], key=lambda q: q['order'])

        existing_ids = set(survey.questions.values_list('id', flat=True))
        kept_ids = {q['id'] for q in questions_data if q.get('id') in existing_ids}

        with transaction.atomic():
            # Delete genuinely-removed questions FIRST, freeing up their
            # `order` values before anything else touches this survey's rows
            # — otherwise a brand-new question reusing a just-vacated order
            # number (or a kept row's final order) could collide with a
            # not-yet-deleted removed row under the (survey, order) unique
            # constraint. This is the only deletion here, and it's the only
            # case that legitimately cascades away a question's historical
            # SurveyAnswers — everything kept, however reordered or edited,
            # preserves its row below.
            survey.questions.exclude(id__in=kept_ids).delete()

            # Move every kept row to a temporary, guaranteed-unique order
            # (order is a PositiveIntegerField, so this has to stay positive
            # — offsetting by each row's own unique id keeps it both
            # positive and collision-free). Without this, updating one kept
            # row to its final order could collide with a sibling row that
            # hasn't been updated yet — e.g. simply swapping two questions'
            # positions.
            if kept_ids:
                SurveyQuestion.objects.filter(id__in=kept_ids).update(order=F('id') + 1000000)

            for q_data in questions_data:
                qid = q_data.get('id')
                if qid in kept_ids:
                    SurveyQuestion.objects.filter(id=qid).update(
                        order=q_data['order'], text=q_data['text'], question_type=q_data['question_type'],
                    )
                    question = SurveyQuestion.objects.get(id=qid)
                else:
                    question = SurveyQuestion.objects.create(
                        survey=survey, order=q_data['order'], text=q_data['text'],
                        question_type=q_data['question_type'],
                    )
                _sync_question_options(question, q_data.get('options', []))

        return Response(SurveySerializer(survey).data)


def _sync_question_options(question, labels):
    """
    Bring `question.options` in line with `labels` (a plain ordered list of
    strings from SurveyBuilder.jsx). Matches existing rows by label text so
    a reorder or an unrelated edit elsewhere keeps each option's primary key
    — and therefore any SurveyAnswer.selected_options link pointing at it —
    exactly the way SurveyQuestionsView keeps question rows. Only an option
    whose text genuinely changed (or was removed) loses its row.
    Non-choice questions end up with no options.
    """
    if question.question_type not in SurveyQuestion.CHOICE_TYPES:
        question.options.all().delete()
        return

    wanted = [lbl.strip() for lbl in labels if lbl and lbl.strip()]
    existing = {opt.label.strip().lower(): opt for opt in question.options.all()}
    keep_ids = set()

    # Park kept rows on temporary unique orders first, same collision-avoidance
    # trick used for questions above.
    for opt in question.options.all():
        SurveyQuestionOption.objects.filter(id=opt.id).update(order=F('id') + 1000000)

    for position, label in enumerate(wanted, start=1):
        match = existing.get(label.lower())
        if match:
            SurveyQuestionOption.objects.filter(id=match.id).update(order=position, label=label)
            keep_ids.add(match.id)
        else:
            new_opt = SurveyQuestionOption.objects.create(
                question=question, order=position, label=label,
            )
            keep_ids.add(new_opt.id)

    question.options.exclude(id__in=keep_ids).delete()


class SurveyAnalyticsView(APIView):
    """
    GET /api/documents/surveys/analytics/
    Admin-only. Total responses and average rating per ACTIVE survey — the
    Survey Analytics widget on the Admin Dashboard.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        data = []
        for survey in Survey.objects.filter(is_active=True):
            avg = SurveyAnswer.objects.filter(
                response__survey=survey, question__question_type=SurveyQuestion.QuestionType.RATING,
                rating_value__isnull=False,
            ).aggregate(avg=Avg('rating_value'))['avg']
            data.append({
                "id": survey.id,
                "title": survey.title,
                "response_count": survey.responses.count(),
                "average_rating": round(avg, 2) if avg is not None else None,
            })
        return Response(data)


class SurveyCommentsPagination(PageNumberPagination):
    # Small on purpose — this backs a Dashboard "recent comments" card, not
    # a full management page (mirrors the Dashboard's existing Top-5-style
    # widgets rather than rendering a long list in place).
    page_size = 5


class SurveyCommentsView(generics.ListAPIView):
    """
    GET /api/documents/surveys/comments/
    Admin-only. Recent citizen SurveyResponses that included a written
    comment (a TEXT question answered with a non-blank value), most recent
    first, each with that same response's star ratings alongside it for
    context. See SurveyCommentSerializer for exactly what is (and isn't)
    exposed — this is the anonymized feed behind the Dashboard's "Citizen
    Comments & Suggestions" card; SurveyAnalyticsView above remains the
    pure-aggregate (count/average) card and is unaffected by this.
    """
    serializer_class = SurveyCommentSerializer
    permission_classes = [IsAdmin]
    pagination_class = SurveyCommentsPagination

    def get_queryset(self):
        return (
            SurveyResponse.objects
            .filter(answers__question__question_type=SurveyQuestion.QuestionType.TEXT, answers__text_value__gt='')
            .select_related('office', 'document__document_type')
            .prefetch_related('answers__question')
            .distinct()
        )


class MySurveyCommentsView(generics.ListAPIView):
    """
    GET /api/documents/my-office-comments/
    Staff/employee equivalent of SurveyCommentsView above, scoped to just
    the requesting user's own office (SurveyResponse.office is a real FK, so
    no string-matching is needed here the way _office_speed_stats() needs
    for Document.current_office). Same anonymization guarantees apply — see
    SurveyCommentSerializer; this never exposes the respondent, document,
    or tracking number either, just like the admin-facing view.
    """
    serializer_class = SurveyCommentSerializer
    permission_classes = [IsStaffUser]
    pagination_class = SurveyCommentsPagination

    def get_queryset(self):
        office = resolve_office(self.request.user.office)
        if not office:
            return SurveyResponse.objects.none()
        return (
            SurveyResponse.objects
            .filter(
                office=office,
                answers__question__question_type=SurveyQuestion.QuestionType.TEXT,
                answers__text_value__gt='',
            )
            .select_related('office', 'document__document_type')
            .prefetch_related('answers__question')
            .distinct()
        )


class SurveyDetailedAnalyticsView(APIView):
    """
    GET /api/documents/surveys/<id>/analytics/
    Admin-only. Full per-question aggregation behind AdminSurveyAnalytics.jsx:
      - rating   -> 1-5 distribution + average
      - likert   -> per-option counts/percent + a numeric average over the
                    option positions + a "positive" (top-2) share
      - single   -> per-option counts/percent
      - multiple -> per-option counts/percent (percent is of respondents who
                    answered the question, so it can sum past 100%)
      - text     -> the list of non-blank comments
    Plus an overall CSAT block computed from the star-rating answers (the
    classic "% who rated 4-5").
    """
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        try:
            survey = Survey.objects.prefetch_related('questions__options').get(pk=pk)
        except Survey.DoesNotExist:
            return Response({"detail": "Survey not found."}, status=status.HTTP_404_NOT_FOUND)

        answers = list(
            SurveyAnswer.objects
            .filter(response__survey=survey)
            .select_related('question')
            .prefetch_related('selected_options')
        )
        answers_by_q = {}
        for a in answers:
            answers_by_q.setdefault(a.question_id, []).append(a)

        questions_out = []
        for q in survey.questions.all():
            qa = answers_by_q.get(q.id, [])
            row = {
                "id": q.id,
                "text": q.text,
                "question_type": q.question_type,
                "answer_count": len(qa),
            }

            if q.question_type == SurveyQuestion.QuestionType.RATING:
                values = [a.rating_value for a in qa if a.rating_value]
                row["distribution"] = [
                    {"value": v, "count": sum(1 for x in values if x == v)} for v in range(1, 6)
                ]
                row["average"] = round(sum(values) / len(values), 2) if values else None

            elif q.question_type in SurveyQuestion.CHOICE_TYPES:
                options = list(q.options.all())
                counts = {opt.id: 0 for opt in options}
                for a in qa:
                    for opt in a.selected_options.all():
                        if opt.id in counts:
                            counts[opt.id] += 1
                denom = len(qa) or 1
                row["options"] = [
                    {
                        "label": opt.label,
                        "order": opt.order,
                        "count": counts[opt.id],
                        "percent": round(counts[opt.id] * 100 / denom, 1),
                    }
                    for opt in options
                ]
                if q.question_type == SurveyQuestion.QuestionType.LIKERT and options:
                    top_orders = {options[-1].order, options[-2].order} if len(options) >= 2 else {options[-1].order}
                    scored, positive = [], 0
                    for a in qa:
                        for opt in a.selected_options.all():
                            scored.append(opt.order)
                            if opt.order in top_orders:
                                positive += 1
                    row["average"] = round(sum(scored) / len(scored), 2) if scored else None
                    row["scale_points"] = len(options)
                    row["positive_percent"] = round(positive * 100 / len(qa), 1) if qa else None

            elif q.question_type == SurveyQuestion.QuestionType.TEXT:
                row["comments"] = [a.text_value.strip() for a in qa if a.text_value.strip()]

            questions_out.append(row)

        rating_values = [
            a.rating_value for a in answers
            if a.question.question_type == SurveyQuestion.QuestionType.RATING and a.rating_value
        ]
        csat = {
            "rating_count": len(rating_values),
            "average": round(sum(rating_values) / len(rating_values), 2) if rating_values else None,
            "satisfied_percent": (
                round(sum(1 for v in rating_values if v >= 4) * 100 / len(rating_values), 1)
                if rating_values else None
            ),
        }

        return Response({
            "id": survey.id,
            "title": survey.title,
            "is_active": survey.is_active,
            "response_count": survey.responses.count(),
            "post_scan_response_count": survey.responses.filter(
                source=SurveyResponse.Source.POST_SCAN
            ).count(),
            "public_response_count": survey.responses.filter(
                source=SurveyResponse.Source.PUBLIC
            ).count(),
            "csat": csat,
            "questions": questions_out,
        })


class PostScanSurveyView(APIView):
    """
    GET  /api/documents/<id>/post-scan-survey/   the active survey + whether
                                                 this citizen has answered it
                                                 for this document already
    POST /api/documents/<id>/post-scan-survey/   submit answers (once)

    The whole-transaction citizen survey shown right after a logged-in
    citizen scans their own document's QR code (see CitizenQRScanView.jsx).
    Unlike the per-office post-release evaluation, this is one survey for the
    entire request, capped at one submission per (survey, document, citizen)
    by SurveyResponse's unique_post_scan_survey_per_document_respondent
    constraint.
    """
    permission_classes = [IsAuthenticated]

    def _get_document(self, request, pk):
        try:
            document = Document.objects.select_related('document_type').get(pk=pk)
        except Document.DoesNotExist:
            raise NotFound("Document not found.")
        if document.requested_by_id != request.user.id:
            raise NotFound("Document not found.")
        return document

    def _already_submitted(self, survey, document, user):
        return SurveyResponse.objects.filter(
            survey=survey, document=document, respondent=user,
            source=SurveyResponse.Source.POST_SCAN,
        ).exists()

    def get(self, request, pk):
        document = self._get_document(request, pk)
        survey = _active_evaluation_survey()
        return Response({
            "survey": SurveySerializer(survey).data if survey else None,
            "already_submitted": bool(survey) and self._already_submitted(survey, document, request.user),
        })

    def post(self, request, pk):
        document = self._get_document(request, pk)
        survey = _active_evaluation_survey()
        if not survey:
            return Response({"detail": "No active survey is configured."}, status=status.HTTP_400_BAD_REQUEST)
        if self._already_submitted(survey, document, request.user):
            return Response({"detail": "You have already answered this survey for this document."},
                            status=status.HTTP_400_BAD_REQUEST)

        cleaned, error = _parse_survey_answers(survey, request.data.get('answers', []))
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                response = SurveyResponse.objects.create(
                    survey=survey, respondent=request.user, document=document,
                    office=None, source=SurveyResponse.Source.POST_SCAN,
                )
                _persist_survey_answers(response, cleaned)
        except IntegrityError:
            return Response({"detail": "You have already answered this survey for this document."},
                            status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Thank you! Your feedback has been recorded."},
                        status=status.HTTP_201_CREATED)


def _parse_survey_answers(survey, raw_answers):
    """
    Validate a list of submitted answers against every question on `survey`.
    Returns (cleaned, None) on success — `cleaned` is a list of
    (question, payload) where payload is one of {rating_value}, {text_value},
    {option_ids} — or ([], "error message") if anything is missing/invalid.
    Shared by the post-scan survey and the public landing survey; the star/
    choice rules are identical, only who may submit differs.
    """
    answers_in = {a.get('question'): a for a in raw_answers if isinstance(a, dict)}
    cleaned = []
    for q in survey.questions.prefetch_related('options'):
        raw = answers_in.get(q.id)
        if raw is None:
            return [], f"Please answer: {q.text}"

        if q.question_type == SurveyQuestion.QuestionType.RATING:
            val = raw.get('rating_value')
            if val not in (1, 2, 3, 4, 5):
                return [], f"'{q.text}' needs a rating from 1 to 5."
            cleaned.append((q, {"rating_value": val}))

        elif q.question_type == SurveyQuestion.QuestionType.TEXT:
            cleaned.append((q, {"text_value": str(raw.get('text_value', '')).strip()}))

        else:  # likert / single / multiple
            valid_ids = {o.id for o in q.options.all()}
            picked = [oid for oid in raw.get('selected_option_ids', []) if oid in valid_ids]
            if q.question_type == SurveyQuestion.QuestionType.MULTIPLE:
                if not picked:
                    return [], f"Pick at least one option for '{q.text}'."
            elif len(picked) != 1:
                return [], f"Pick one option for '{q.text}'."
            cleaned.append((q, {"option_ids": picked}))

    return cleaned, None


def _persist_survey_answers(response, cleaned):
    """Write the (question, payload) pairs from _parse_survey_answers onto a
    freshly created SurveyResponse."""
    for q, payload in cleaned:
        answer = SurveyAnswer.objects.create(
            response=response, question=q,
            rating_value=payload.get('rating_value'),
            text_value=payload.get('text_value', ''),
        )
        if payload.get('option_ids'):
            answer.selected_options.set(payload['option_ids'])


class PublicSurveyView(APIView):
    """
    GET  /api/documents/surveys/public/   the single active survey, for the
                                          landing-page survey card — no
                                          account, no document needed
    POST /api/documents/surveys/public/   submit answers anonymously

    Stored as a SurveyResponse with source=PUBLIC and no document / office /
    respondent. There is no server-side one-per-person cap (there's no
    identity to key it on); the landing card keeps a localStorage flag so a
    given browser isn't re-prompted, and the endpoint is rate-limited by the
    shared 'public-track' throttle scope.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'public-track'

    def get(self, request):
        survey = _active_evaluation_survey()
        return Response({"survey": SurveySerializer(survey).data if survey else None})

    def post(self, request):
        survey = _active_evaluation_survey()
        if not survey:
            return Response({"detail": "No active survey is configured."}, status=status.HTTP_400_BAD_REQUEST)

        cleaned, error = _parse_survey_answers(survey, request.data.get('answers', []))
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            response = SurveyResponse.objects.create(
                survey=survey, respondent=None, document=None, office=None,
                source=SurveyResponse.Source.PUBLIC,
            )
            _persist_survey_answers(response, cleaned)

        return Response({"detail": "Salamat! Your feedback has been recorded."},
                        status=status.HTTP_201_CREATED)


class CitizenSuggestionListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/documents/suggestions/   the requesting citizen's own suggestions
    POST /api/documents/suggestions/   file a new one (addressed to the LGU)
    Logged-in citizens only — a suggestion is always tied to the account
    that sent it so the office can follow up.
    """
    serializer_class = CitizenSuggestionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CitizenSuggestion.objects.filter(respondent=self.request.user)

    def perform_create(self, serializer):
        serializer.save(respondent=self.request.user)


class AdminSuggestionPagination(PageNumberPagination):
    page_size = 20


class AdminSuggestionListView(generics.ListAPIView):
    """
    GET /api/documents/suggestions/admin/?status=new|reviewed|in_progress|archived&category=<key>
    Admin-only triage feed for the Suggestion Box review dashboard.
    """
    serializer_class = CitizenSuggestionAdminSerializer
    permission_classes = [IsAdmin]
    pagination_class = AdminSuggestionPagination

    def get_queryset(self):
        qs = CitizenSuggestion.objects.select_related('respondent', 'reviewed_by')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs


class AdminSuggestionDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/documents/suggestions/admin/<id>/
    Admin-only. PATCH updates `status` and/or `admin_notes`; changing the
    status stamps who reviewed it and when.
    """
    queryset = CitizenSuggestion.objects.select_related('respondent', 'reviewed_by')
    serializer_class = CitizenSuggestionAdminSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        changing_status = (
            'status' in serializer.validated_data
            and serializer.validated_data['status'] != serializer.instance.status
        )
        instance = serializer.save()
        if changing_status:
            instance.reviewed_by = self.request.user
            instance.reviewed_at = timezone.now()
            instance.save(update_fields=['reviewed_by', 'reviewed_at'])


class EmailNotificationLogPagination(PageNumberPagination):
    page_size = 20


class EmailNotificationLogListView(generics.ListAPIView):
    """
    GET /api/documents/email-notifications/?type=overdue_warning|due_soon|ready_for_release&status=sent|failed
    Admin-only audit trail of every automated email the system has sent —
    populated by notifications.py::_send_and_log() from sla_scan.py (staff
    overdue/due-soon warnings) and services.py::advance_processing_stage()
    (citizen ready-for-release notices). Powers the admin notification
    bell (NotificationBell.jsx) — there is no separate email-notifications
    page; this is the only access point for that activity.
    """
    serializer_class = EmailNotificationLogSerializer
    permission_classes = [IsAdmin]
    pagination_class = EmailNotificationLogPagination

    def get_queryset(self):
        qs = EmailNotificationLog.objects.select_related('document', 'recipient')
        notification_type = self.request.query_params.get('type')
        if notification_type:
            qs = qs.filter(notification_type=notification_type)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class RunSlaScanView(APIView):
    """
    POST /api/documents/email-notifications/run-scan/
    Admin-only manual trigger for the same overdue/missing SLA scans the
    background scheduler (apps/documents/scheduler.py) already runs
    automatically every SLA_SCAN_INTERVAL_SECONDS — lets an admin verify or
    demo the notification system immediately instead of waiting for the
    next scheduled pass. Shares sla_scan.py with the scheduler and the
    management commands, so results are identical either way.
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        overdue_result = run_overdue_scan()
        missing_result = run_missing_scan()
        return Response({'overdue': overdue_result, 'missing': missing_result})


class NotificationPagination(PageNumberPagination):
    page_size = 20


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/?unread=true
    The current user's own notifications — the NotificationBell dropdown,
    for Admin and Employee alike (any authenticated role, scoped to
    recipient=request.user, so there's nothing role-specific to enforce here
    beyond being logged in).
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NotificationPagination

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user).select_related('sender', 'related_document')
        if self.request.query_params.get('unread') == 'true':
            qs = qs.filter(is_read=False)
        return qs


class NotificationUnreadCountView(APIView):
    """GET /api/notifications/unread-count/ — the bell's badge number, without paginating the full list."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"count": count})


class NotificationMarkReadView(APIView):
    """PATCH /api/notifications/<id>/read/ — toggles is_read (so the bell can also "mark as unread")."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, recipient=request.user)
        except Notification.DoesNotExist:
            return Response({"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)

        if 'is_read' in request.data:
            notification.is_read = bool(request.data['is_read'])
        else:
            notification.is_read = not notification.is_read
        notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """POST /api/notifications/mark-all-read/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"detail": f"{updated} notification(s) marked as read."})