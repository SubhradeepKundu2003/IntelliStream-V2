import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_manager_or_above
from database import get_db
from sync.models import SyncedBatch

router = APIRouter(prefix="/batch-management", tags=["batch-management"])


class BatchRequest(BaseModel):
    batchName: str
    traineeCount: int
    subjects: list[str]


def _to_response(b: SyncedBatch) -> dict:
    return {
        "batchName": b.batch_name,
        "traineeCount": b.trainee_count,
        "subjects": json.loads(b.subjects_json),
    }


@router.get("", dependencies=[Depends(get_current_user)])
def list_batches(db: Session = Depends(get_db)):
    return [_to_response(b) for b in db.query(SyncedBatch).all()]


@router.post("", status_code=201, dependencies=[Depends(require_manager_or_above)])
def create_batch(body: BatchRequest, db: Session = Depends(get_db)):
    if db.query(SyncedBatch).filter(SyncedBatch.batch_name == body.batchName).first():
        raise HTTPException(status_code=409, detail="Batch already exists")
    batch = SyncedBatch(
        batch_name=body.batchName,
        trainee_count=body.traineeCount,
        subjects_json=json.dumps(body.subjects),
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return _to_response(batch)


@router.get("/{batch_name}", dependencies=[Depends(get_current_user)])
def get_batch(batch_name: str, db: Session = Depends(get_db)):
    b = db.query(SyncedBatch).filter(SyncedBatch.batch_name == batch_name).first()
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _to_response(b)


@router.put("/{batch_name}", dependencies=[Depends(require_manager_or_above)])
def update_batch(batch_name: str, body: BatchRequest, db: Session = Depends(get_db)):
    b = db.query(SyncedBatch).filter(SyncedBatch.batch_name == batch_name).first()
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    b.batch_name = body.batchName
    b.trainee_count = body.traineeCount
    b.subjects_json = json.dumps(body.subjects)
    db.commit()
    db.refresh(b)
    return _to_response(b)


@router.delete("/{batch_name}", status_code=204, dependencies=[Depends(require_manager_or_above)])
def delete_batch(batch_name: str, db: Session = Depends(get_db)):
    b = db.query(SyncedBatch).filter(SyncedBatch.batch_name == batch_name).first()
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    db.delete(b)
    db.commit()
