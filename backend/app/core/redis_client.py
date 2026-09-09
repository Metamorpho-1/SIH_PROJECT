import json
import logging
from typing import AsyncGenerator
import redis.asyncio as redis
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global Redis pool for FastAPI
redis_client: redis.Redis = None

async def init_redis_pool() -> None:
    global redis_client
    redis_client = redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )
    try:
        await redis_client.ping()
        logger.info(f"Connected to Redis at {settings.REDIS_URL}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")

async def close_redis_pool() -> None:
    global redis_client
    if redis_client:
        await redis_client.aclose()
        logger.info("Closed Redis connection")

async def get_redis() -> redis.Redis:
    if redis_client is None:
        await init_redis_pool()
    return redis_client
