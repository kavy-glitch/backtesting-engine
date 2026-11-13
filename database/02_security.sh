#!/bin/bash
# Runs once, inside the MySQL container, after schema.sql (docker-entrypoint-initdb.d).
# DCL: least-privilege accounts. Passwords come from environment variables - never from files.
set -euo pipefail
: "${MYSQL_ROOT_PASSWORD:?}" "${MYSQL_DATABASE:?}" "${PBE_APP_USER:?}" "${PBE_APP_PASSWORD:?}"
: "${PBE_READONLY_USER:?}" "${PBE_READONLY_PASSWORD:?}"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${PBE_APP_USER}'@'%' IDENTIFIED BY '${PBE_APP_PASSWORD}';
CREATE USER IF NOT EXISTS '${PBE_READONLY_USER}'@'%' IDENTIFIED BY '${PBE_READONLY_PASSWORD}';
-- The API can read/write rows and call procedures, but cannot alter or drop tables.
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON \`${MYSQL_DATABASE}\`.* TO '${PBE_APP_USER}'@'%';
-- Reporting account: read only.
GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO '${PBE_READONLY_USER}'@'%';
FLUSH PRIVILEGES;
SQL
