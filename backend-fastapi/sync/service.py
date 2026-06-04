from datetime import datetime, timezone


async def run_sync(preserve_excel: bool = False) -> dict:
    return {
        "batches_synced": 0,
        "dpi_records_synced": 0,
        "scores_synced": 0,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
