#!/usr/bin/env python3
"""Restore the disposable local test database into a fresh temporary database.

Never accepts a provider/project/source database argument. Requires local Compose;
never restores over an existing database, emits row data, or contacts Railway.
"""
import hashlib
import json
import subprocess
import time
import uuid

SOURCE = "directorxo_test"
TARGET = "directorxo_restore_" + uuid.uuid4().hex
PREFIX = ["docker", "compose", "exec", "-T", "postgres"]


def run(args, data=None):
    result = subprocess.run(PREFIX + args, input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        # Error output can contain rows/SQL values. Keep failure reporting metadata-only.
        raise RuntimeError("Local restore command failed: " + args[0])
    return result.stdout


def query(database, sql):
    return run(["psql", "-U", "dxo_admin", "-d", database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).decode().strip()


def fingerprint(database):
    names = json.loads(query(database, "select json_agg(tablename order by tablename) from pg_tables where schemaname='public'"))
    digests = []
    for name in names:
        quoted = '"' + name.replace('"', '""') + '"'
        # Hash row representations inside Postgres; never transfer identity/session data.
        digest = query(database, f"select count(*)::text || ':' || coalesce(md5(string_agg(row_hash, ',' order by row_hash)), '') from (select md5(row_to_json(t)::text) as row_hash from public.{quoted} t) r")
        digests.append([name, digest])
    for sql in [
        "select row_to_json(r)::text from (select c.relname,a.attname,a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum) r",
        "select row_to_json(r)::text from (select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname) r",
        "select row_to_json(r)::text from (select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner, c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname) r",
        "select row_to_json(r)::text from (select * from pg_policies where schemaname='public' order by tablename,policyname) r",
        "select row_to_json(r)::text from (select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig, p.proacl::text, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' order by p.proname,p.oid::regprocedure::text) r",
    ]:
        digests.append(hashlib.sha256(query(database, sql).encode()).hexdigest())
    digests.append(hashlib.sha256(query(database, "select row_to_json(t)::text from drizzle.__drizzle_migrations t order by id").encode()).hexdigest())
    return digests, len(names)


started = time.monotonic()
created = False
try:
    before, tables = fingerprint(SOURCE)
    archive = run(["pg_dump", "-U", "dxo_admin", "-d", SOURCE, "--format=custom"])
    run(["createdb", "-U", "dxo_admin", TARGET])
    created = True
    run(["pg_restore", "-U", "dxo_admin", "-d", TARGET, "--exit-on-error"], archive)
    restored, restored_tables = fingerprint(TARGET)
    after, _ = fingerprint(SOURCE)
    if before != after:
        raise RuntimeError("Source changed during drill; rerun after database tests finish")
    if before != restored or tables != restored_tables:
        raise RuntimeError("Restored data or security catalogue differs from source")
    print(json.dumps({"status": "passed", "source": SOURCE, "publicTables": tables,
                      "elapsedSeconds": round(time.monotonic() - started, 2),
                      "verified": ["row counts and content digests", "table ownership and table/column grants", "trigger definitions", "FORCE RLS and policies", "security function definitions and grants"],
                      "scope": "local logical restore only; no production PITR/RPO certification"}))
finally:
    if created:
        run(["dropdb", "-U", "dxo_admin", TARGET])
