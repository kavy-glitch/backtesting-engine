"""Apply database/schema.sql. Understands the mysql client's DELIMITER command."""
from __future__ import annotations

from pathlib import Path


def split_sql(text: str) -> list[str]:
    statements: list[str] = []
    delimiter = ";"
    buf: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("DELIMITER "):
            delimiter = stripped.split(None, 1)[1]
            continue
        if not buf and (not stripped or stripped.startswith("--")):
            continue
        buf.append(line)
        if stripped.endswith(delimiter):
            stmt = "\n".join(buf).rstrip()
            stmt = stmt[: -len(delimiter)].rstrip()
            if stmt:
                statements.append(stmt)
            buf = []
    if "".join(buf).strip():
        statements.append("\n".join(buf).strip())
    return statements


def apply_schema(conn, schema_path: str | Path) -> int:
    statements = split_sql(Path(schema_path).read_text(encoding="utf-8"))
    with conn.cursor() as cur:
        for stmt in statements:
            cur.execute(stmt)
    conn.commit()
    return len(statements)
