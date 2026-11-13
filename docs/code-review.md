## Code review rules

Use these rules when a review is requested or required; they do not add review rounds.
Apply code and test checks to executable changes, not prose-only edits.

- Review the diff and affected callers for correctness, security, data loss, concurrency,
  and error-handling defects. Leave formatting and lint findings to CI.
- Order findings by severity. Each gives severity, `path:line`, the concrete trigger and
  consequence, and a fix. Mark it confirmed (reproduced or traced through code) or plausible
  (state the missing evidence); distinguish static review from executed checks.
- Trace validation of external input (users, files, network responses, environment) before
  use. Flag missing validation, swallowed errors, or blank values treated as zero when they
  hide a failure or violate the expected contract; respect documented best-effort cleanup.
- Flag new logic without meaningful test coverage, including an edge case. A test claiming
  to cover changed behavior must fail without that behavior; this does not apply to unrelated
  tests. State whether failure was demonstrated or only inferred.
- Flag new dependencies, network calls, or stored-data shape changes absent from the PR
  description. Disclosure does not replace any required approval.
- Flag changes outside the PR's stated purpose. If no defects are found, say so in one line
  and identify the review scope and unrun checks without implying runtime validation.
- Follow this repository's security-reporting rules for sensitive findings; keep exploit
  details and private data out of public review comments.
