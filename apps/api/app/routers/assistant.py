from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.assistant import AssistantError, run_assistant_task
from app.auth import require_internal_auth

router = APIRouter(prefix="/assistant", tags=["assistant"], dependencies=[Depends(require_internal_auth)])


class AssistantRequest(BaseModel):
    taskType: str
    context: str


@router.post("/run")
async def run_task(body: AssistantRequest) -> dict[str, str]:
    try:
        result = await run_assistant_task(body.taskType, body.context)
        return {"status": "ready", "result": result}
    except AssistantError as exc:
        return {"status": "failed", "reason": str(exc)}
