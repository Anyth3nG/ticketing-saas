import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

engine = create_engine(
    os.getenv("DATABASE_URL"),
    # Postgres runs on the same instance, so a reboot or a service restart
    # kills every pooled connection while the app keeps running. Without a
    # liveness check the pool hands out dead connections and every DB-backed
    # route 503s (see the 503 handlers in auth.py) until the app is restarted.
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
