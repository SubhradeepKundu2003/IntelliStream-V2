from sqlalchemy.orm import Session

from .models import Notification, NotificationType
from .ws_manager import schedule_broadcast


def create_notification(
    db: Session,
    recipient_email: str,
    type: NotificationType,
    title: str,
    message: str,
) -> None:
    n = Notification(
        recipient_email=recipient_email,
        type=type,
        title=title,
        message=message,
    )
    db.add(n)
    db.flush()
    schedule_broadcast(recipient_email, {
        "id": n.id,
        "type": n.type.value,
        "title": n.title,
        "message": n.message,
        "is_read": False,
        "created_at": n.created_at.isoformat(),
    })
