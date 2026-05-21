"""Live log ingest plane.

Two log sources (Docker daemon, file replay) feed a pipeline of:
  source → parser → ring-buffer + aggregator → predict_one() → WS broadcast.

Single source of truth per site: SiteState (in-memory). Aggregator marks
endpoints dirty; runner debounces and re-infers on a 30-second tick or on a
spike (auth-fail drift, call-count jump, new endpoint).
"""
