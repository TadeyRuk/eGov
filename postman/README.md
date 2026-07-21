# eGov Hackathon API Tests

The collection is safe to commit: it holds only endpoint paths and placeholder prompts. Its environment contains empty placeholders, never credentials.

1. Keep real credentials only in `.local/postman/eGov-hackathon.local.postman_environment.json`. The entire `.local/` directory is Git-ignored.
2. Set `base` and `access_code` in the active environment.
3. Run the credential-free, read-only eGovChain smoke test:

   ```bash
   pnpm test
   ```

   This runs only the two public JSON-RPC requests: chain ID and latest block.

4. To run the credentialed hackathon collection, first fill only the required local environment variables, then explicitly run:

   ```bash
   pnpm test:egov-hackathon
   ```

The full collection obtains a fresh token and keeps it in the in-memory `hackathon_token` environment variable. It runs a Credits request before generation requests. Do not run the Document Extractor request unless `document_file` points to a permitted, non-sensitive fixture. Generation endpoints can consume hackathon credits.

It also includes eGovChain read-only JSON-RPC smoke tests. The eGov SSO requests are ready but need the dashboard-issued `partner_code`, `partner_secret`, and `exchange_code` entered directly into the local environment. Confirm the exact SSO request contract in the dashboard before running it.
