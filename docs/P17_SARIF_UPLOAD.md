# P17 — Approved GitHub SARIF Upload

DockyardOS can optionally upload one generated `dockyard.sarif` artifact to GitHub code scanning.

The upload path is intentionally review-first:

1. generate/export DockyardOS SARIF inside the current project's immutable run directory;
2. create a read-only upload plan with explicit repository, commit SHA, and Git ref;
3. review the returned SARIF SHA-256 and target;
4. run the upload only with `--approve` and that exact `--expected-sha256`;
5. DockyardOS re-hashes the artifact immediately before upload and aborts if it changed.

Example:

```bash
dockyard security sarif upload plan \
  --sarif ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/dockyard.sarif \
  --repo owner/repo \
  --commit <40-char-sha> \
  --ref refs/heads/main
```

Then, after reviewing the plan:

```bash
dockyard security sarif upload run \
  --sarif ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/dockyard.sarif \
  --repo owner/repo \
  --commit <40-char-sha> \
  --ref refs/heads/main \
  --expected-sha256 <reviewed-digest> \
  --approve
```

## Safety boundaries

- Upload is never automatic.
- No GitHub token is accepted on the command line or stored in DockyardOS state.
- Execution uses the already-authenticated GitHub CLI (`gh`).
- Only `dockyard.sarif` inside the current project's security-run directory is eligible.
- The embedded Dockyard run ID must match the artifact directory.
- Repository, commit, and ref are explicit and validated.
- The reviewed SHA-256 must still match at execution time.
- Compressed SARIF is bounded to GitHub's supported upload size.
- Upload acceptance and processing status are recorded as an external audit artifact.
- Accepted-but-unverified and processing-failed states are not reported as complete.

The adapter does not create repositories, enable code scanning, modify branch protection, or change repository security settings.