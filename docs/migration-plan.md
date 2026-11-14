# Legacy migration plan

## Objective

Migrate the existing browser-based Hemeroteca to a central Node.js and PostgreSQL service without losing the current library, learning activities or media.

## Legacy data sources

The current application keeps metadata in browser storage (including localStorage) and binary files in IndexedDB. Its documented backup format is JSON with the `hemeroteca-backup` marker and version 1. A JSON backup alone may not contain every binary object unless the export process explicitly includes it.

## Required migration safeguards

1. Keep the original browser profile and all source devices intact until migration verification is complete.
2. Export a fresh legacy backup and separately inventory IndexedDB binary records.
3. Record counts, identifiers, byte sizes and cryptographic checksums for source records and files.
4. Import into a staging database and private object storage first.
5. Preserve stable legacy IDs in dedicated legacy-ID columns or a migration mapping table.
6. Resolve every legacy file reference (such as `archivoId`) to exactly one stored object.
7. Report malformed records, duplicate IDs, missing files and unsupported formats; do not silently discard them.
8. Compare source and destination counts, sizes and checksums before cutover.
9. Keep a restorable backup and a documented rollback procedure.

## Suggested import phases

- Inventory: identify all metadata stores, IndexedDB databases/object stores and export variants.
- Transform: normalize records and map legacy users/roles to server-managed accounts.
- Upload: transfer binary objects to private object storage and persist their object keys.
- Load: import relational records in dependency order inside database transactions.
- Verify: produce a migration report with counts, unresolved references and checksum results.
- Cutover: switch the frontend to the API only after acceptance tests and a verified restore point.

## Security changes during migration

Legacy client-side password hashes, role selectors and browser-side permissions are not trusted authentication or authorization mechanisms. Accounts must be provisioned or password-reset into server-side authentication. The server must enforce role and ownership checks for every protected operation.

## Current implementation status

The initial API scaffold provides liveness and PostgreSQL readiness checks only. Domain tables, authentication, file storage adapters, legacy export parsing and import execution are not implemented yet.
