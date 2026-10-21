from apps.documents.models import Document


def link_guest_documents(user):
    """
    Automatic Guest-to-User Account Linking: finds every guest-created
    Document (guest_email set, requested_by still null) matching this
    user's email and links them to the account. Called on both
    registration AND login — a document can end up guest-created even
    after an account already exists with that email (e.g. staff typing in
    guest contact details directly instead of searching for the account
    via CitizenPicker), so this is deliberately cheap/idempotent to run
    every time: a no-op query when there's nothing to link.

    Clears guest_name/guest_email once linked — the same convention
    CreateDocumentSerializer.validate() already follows for any document
    with requested_by set, so a linked document is never left holding
    stale guest-entered contact info that could silently disagree with the
    real account's own name/email.

    Returns how many documents were linked (0 most of the time).
    """
    guest_documents = Document.objects.filter(guest_email__iexact=user.email, requested_by__isnull=True)
    count = guest_documents.count()
    if count:
        guest_documents.update(requested_by=user, guest_name='', guest_email='')
    return count
