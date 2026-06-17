# Connector Agent Notes

## Scope

- Worker B owns `connector/` and this notes file only.
- CLI name is `aiuw`.
- Current implementation targets M1 mock connector behavior and now validates mock snapshots through the root schema.

## Implemented

- `aiuw start --mock <fixture> --port 8787`
- `aiuw pair`
- `aiuw status`
- Bearer-token protected `GET /v1/ping`
- Bearer-token protected `GET /v1/snapshot`
- Local config at `~/.aiuw/config.json`
- Config directory/file permissions set to `0700` / `0600`
- Pairing token rotation and QR payload rendering

## Pending Inputs

- Real collector work from later milestones.
