# Architecture

## Selected stack

- Frontend: preserve the existing HTML, CSS and vanilla JavaScript interface during the migration.
- API: Node.js with Express 5, versioned under `/api/v1`.
- Database: PostgreSQL.
- Database access: `pg` connection pool; schema changes will be versioned as SQL migrations.
- Validation: Zod at environment and request boundaries.
- HTTP hardening: Helmet, bounded request bodies, secure cookies, CSRF protection and rate limits as authentication endpoints are introduced.
- File storage: private object storage compatible with S3. PostgreSQL stores object keys and metadata, not Base64 file bodies.

## Trust boundaries

The browser is an untrusted client. The server must authenticate every protected request and authorize every operation against the account's server-side role and resource ownership. A role, user ID, permission or file path supplied by browser JavaScript must never be accepted as proof of authorization.

Initial roles: administrator, teacher and student. Public account registration remains disabled unless an administrator explicitly enables a controlled workflow.

## Initial API foundation

- `GET /api/v1/health/live`: process liveness.
- `GET /api/v1/health/ready`: readiness, including a PostgreSQL connectivity check.

Health responses intentionally avoid returning credentials, connection strings or internal exception details.

## Planned domain areas

Users and sessions; digital library and file metadata; tasks and submissions; announcements; photo gallery; virtual museums; institution settings; audit events.

## File handling

Do not store large file bodies in PostgreSQL or Base64 in JSON. Uploads should use validated, short-lived signed URLs or a controlled multipart upload flow. Production storage must be persistent and must not rely on an ephemeral application filesystem.

## Deployment

Terminate HTTPS at the hosting platform or reverse proxy. Keep database credentials and object-storage credentials in server-side environment configuration. Apply database migrations as a controlled deployment step and maintain tested backups.
