"""One error shape for the whole API:  {"error": {"code", "message", "details"}}"""
from __future__ import annotations

import logging
from typing import Any

import pymysql
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("pbe")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def not_found(what: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what} not found")


def _body(code: str, message: str, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content=_body("VALIDATION_ERROR", "Request validation failed", details))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code, content=_body(code, str(exc.detail)))

    @app.exception_handler(pymysql.err.OperationalError)
    async def _db_down(_: Request, exc: pymysql.err.OperationalError):
        code = exc.args[0] if exc.args else 0
        if code in (1045, 1049, 1130, 2002, 2003, 2006, 2013):  # auth / unknown db / cannot connect / gone away
            log.error("database unavailable: %s", exc)
            return JSONResponse(status_code=503, content=_body("DATABASE_UNAVAILABLE", "The database is not reachable. Check that MySQL is running and the PBE_DB_* settings are correct."))
        log.exception("database error")
        return JSONResponse(status_code=500, content=_body("DATABASE_ERROR", "A database error occurred."))

    @app.exception_handler(pymysql.err.MySQLError)
    async def _db(_: Request, exc: pymysql.err.MySQLError):
        log.exception("database error")
        return JSONResponse(status_code=500, content=_body("DATABASE_ERROR", "A database error occurred."))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")  # stack trace stays in the server log, never in the response
        return JSONResponse(status_code=500, content=_body("INTERNAL_ERROR", "Unexpected server error."))
