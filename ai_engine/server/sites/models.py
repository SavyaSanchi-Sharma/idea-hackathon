"""Pydantic models for the site registry API surface."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


SourceType = Literal["docker", "file_replay"]


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    source_type: SourceType
    source_config: dict[str, Any]
    service_lane: str = Field(default="payments")
    runtime: str = Field(default="python")
    runtime_version: str = Field(default="3.11")


class Site(BaseModel):
    id: str
    name: str
    source_type: SourceType
    source_config: dict[str, Any]
    service_lane: str
    runtime: str
    runtime_version: str
    created_at: float
    status: str  # active | stopped | error


class SiteStats(BaseModel):
    lines_ingested: int
    lines_dropped: int
    parser_format: str
    endpoints_discovered: int
    started_at: float
    ws_subscribers: int
