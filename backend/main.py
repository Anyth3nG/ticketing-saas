import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# The interactive docs publish every route, parameter and schema. That's
# useful locally, but on a public origin it just hands an attacker the full
# API surface, so serve them everywhere except prod.
_is_prod = os.getenv("ENVIRONMENT") == "prod"

app = FastAPI(
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5173",
        "https://testing.max-cpa.co.il",
        "https://workload.max-cpa.co.il",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


from routes.tickets import router as tickets_router
from routes.users import router as users_router
from routes.notifications import router as notifications_router

app.include_router(tickets_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
