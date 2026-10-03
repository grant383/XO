# ADR-0010 — Hosting on Railway; recovery objectives

- Status: Accepted (decision D3)
- Date: 2026-10-03

## Decision
Initial environments run on Railway with separate **staging** and **production** environments, each containing:
- Next.js web service (`next start`, standalone output)
- BullMQ worker service (same codebase, separate start command)
- PostgreSQL
- Redis (`maxmemory-policy noeviction`)
- S3-compatible object storage bucket

Migrations run as a release step using `MIGRATION_DATABASE_URL`; runtime services receive only `DATABASE_URL` (`dxo_app`) and `AUTH_DATABASE_URL` (`dxo_auth`).

Portability: no Railway-specific APIs in application code. All infrastructure is reached via standard protocols (PostgreSQL, Redis, S3, SMTP/HTTP) configured by environment variables, so services can move to AWS without changing domain logic. No Kubernetes, EKS, Kafka or service mesh.

## Recovery objectives (P0; revisit before production GA)
- **RPO ≤ 15 minutes**
- **RTO ≤ 4 hours**

Backup/PITR configuration and a timed restore drill are P0 step 11 deliverables; if Railway's managed backups cannot meet the RPO, continuous WAL archiving to object storage will be added and recorded here.
