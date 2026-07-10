from __future__ import annotations

import asyncio
import json
import logging
import socket
import time
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any

try:
    from server.app.config import SETTINGS
except ImportError:
    from app.config import SETTINGS

logger = logging.getLogger(__name__)


@dataclass
class AudioStats:
    queued: int = 0
    sent: int = 0
    dropped: int = 0
    max_queue_age_ms: float = 0.0
    total_bytes_sent: int = 0
    started_at: float = field(default_factory=time.monotonic)
    last_metrics_log: float = field(default_factory=time.monotonic)

    def summary(self) -> str:
        return (
            f"audio_chunks={self.queued} "
            f"enviados={self.sent} "
            f"descartados={self.dropped} "
            f"bytes={self.total_bytes_sent} "
            f"maior_fila={self.max_queue_age_ms:.0f}ms"
        )

    def average_latency_ms(self) -> float:
        elapsed = max(1.0, time.monotonic() - self.started_at)
        return (self.max_queue_age_ms / elapsed) * 1000 if elapsed else 0.0

    def uptime(self) -> str:
        return str(timedelta(seconds=int(time.monotonic() - self.started_at)))


class AudioBuffer:
    def __init__(self, max_size: int) -> None:
        self.queue: asyncio.Queue[tuple[bytes, float]] = asyncio.Queue(maxsize=max_size)
        self.stats = AudioStats()

    def push(self, data: bytes, captured_at: float) -> None:
        while True:
            try:
                self.queue.put_nowait((data, captured_at))
                self.stats.queued += 1
                return
            except asyncio.QueueFull:
                self.drop_oldest()

    def drop_oldest(self) -> None:
        try:
            self.queue.get_nowait()
            self.stats.dropped += 1
        except asyncio.QueueEmpty:
            return

    def drain_stale(self) -> None:
        dropped = 0
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                dropped += 1
            except asyncio.QueueEmpty:
                break
        self.stats.dropped += dropped
        if dropped:
            logger.warning(
                "Filtrando %s quadros antigos da fila para reduzir atraso.",
                dropped,
            )

    def queue_size(self) -> int:
        return self.queue.qsize()


def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def classify_speaker(text: str) -> str:
    lower = text.lower()
    if any(
        keyword in lower
        for keyword in ("professor", "professora", "docente", "instrutor")
    ):
        return "Professor"
    if any(
        keyword in lower for keyword in ("aluno", "aluna", "turma", "pessoal", "gente")
    ):
        return "Aluno"
    if "?" in lower or any(
        keyword in lower for keyword in ("por que", "como", "quando", "onde", "o que")
    ):
        return "Aluno"
    return "Professor"


class TranscriptSaver:
    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []
        self.dir = Path(SETTINGS.transcript_output_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.start_at = time.monotonic()
        self.text_file = self.dir / "transcricao.txt"
        self.json_file = self.dir / "transcricao.json"
        self.srt_file = self.dir / "transcricao.srt"

    def save_final(self, text: str, speaker: str) -> None:
        timestamp = time.monotonic() - self.start_at
        entry = {
            "timestamp": format_timestamp(timestamp),
            "seconds": round(timestamp, 2),
            "speaker": speaker,
            "text": text,
        }
        self.entries.append(entry)
        self._append_txt(entry)
        self._write_json()
        self._write_srt()

    def _append_txt(self, entry: dict[str, Any]) -> None:
        with self.text_file.open("a", encoding="utf-8") as handle:
            handle.write(
                f"[{entry['timestamp']}] {entry['speaker']}: {entry['text']}\n"
            )

    def _write_json(self) -> None:
        with self.json_file.open("w", encoding="utf-8") as handle:
            json.dump(self.entries, handle, ensure_ascii=False, indent=2)

    def _write_srt(self) -> None:
        with self.srt_file.open("w", encoding="utf-8") as handle:
            for index, entry in enumerate(self.entries, start=1):
                start_seconds = entry["seconds"]
                duration = max(1.5, min(7.0, len(entry["text"]) / 15))
                end_seconds = start_seconds + duration
                handle.write(f"{index}\n")
                handle.write(
                    f"{self._srt_timecode(start_seconds)} --> "
                    f"{self._srt_timecode(end_seconds)}\n"
                )
                handle.write(f"{entry['speaker']}: {entry['text']}\n\n")

    def _srt_timecode(self, seconds: float) -> str:
        ms = int((seconds - int(seconds)) * 1000)
        total_seconds = int(seconds)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def is_internet_available() -> bool:
    try:
        with socket.create_connection(
            (SETTINGS.probe_host, SETTINGS.probe_port),
            timeout=SETTINGS.probe_timeout,
        ):
            return True
    except OSError as exc:
        logger.warning("Falha na checagem de internet: %s", exc)
        return False
