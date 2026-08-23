import asyncio

from fastapi import WebSocket

connections: dict[str, list[WebSocket]] = {}
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


async def broadcast_to_user(email: str, data: dict) -> None:
    sockets = list(connections.get(email, []))
    dead = []
    for ws in sockets:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            connections[email].remove(ws)
        except ValueError:
            pass


def schedule_broadcast(email: str, data: dict) -> None:
    if _loop and _loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_to_user(email, data), _loop)
