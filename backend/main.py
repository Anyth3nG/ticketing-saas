import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI

# The interactive docs publish every route, parameter and schema. That's
# useful locally, but on a public origin it just hands an attacker the full
# API surface, so serve them everywhere except prod.
_is_prod = os.getenv("ENVIRONMENT") == "prod"

app = FastAPI(
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

# NO CORS MIDDLEWARE, DELIBERATELY.
#
# The SPA and this API are served from ONE origin: the shared proxy routes
# /api here and everything else to the frontend container. Same-origin
# requests are not subject to CORS at all, so there is nothing to configure --
# and nothing to forget to add when a hostname changes.
#
# It used to be an allow_origins list hardcoded here, which meant a new
# environment needed a code change and a deploy to be reachable at all. If a
# genuinely cross-origin caller ever appears, add the middleware back driven
# by an env var, never by another literal list.


@app.get("/health")
def health():
    return {"status": "ok"}


from routes.tickets import router as tickets_router
from routes.users import router as users_router
from routes.notifications import router as notifications_router
from routes.admin import router as admin_router
from routes.meetings import router as meetings_router

app.include_router(tickets_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(meetings_router, prefix="/api")
