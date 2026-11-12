# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub's report form](https://github.com/JoelA510/AIAdvocate/security/advisories/new),
or open this repository's [Security tab](https://github.com/JoelA510/AIAdvocate/security)
and choose **Report a vulnerability**. Please don't include vulnerability details in a
public issue, discussion, or pull request.

Include the affected app version or commit, platform, component, steps to reproduce,
and the impact: what someone could read, change, or trigger without permission.
Use a minimal proof of concept with synthetic data. Redact credentials, session tokens,
push tokens, addresses, and other people's information from logs and screenshots.

The repository maintainer, @JoelA510, handles reports. There is no guaranteed response
or fix deadline. The maintainer will reply in the private report, discuss whether the
issue can be reproduced, and coordinate a fix and public disclosure with you.
Researcher credit is included only with your consent.

## What's in scope

- The AI Advocate mobile and web clients under `mobile-app/`, including the web admin
  surface, session handling, local storage, and handling of untrusted content.
- The application's Supabase backend: Edge Functions, database functions, row-level
  security policies, and scheduled jobs. This includes access to another session's
  saved bills, reactions, subscriptions, or push token; unauthorized admin actions;
  and unauthorized changes to legislation, summaries, translations, or notifications.
- Representative lookup and the application's handling of location data, logs,
  credentials, and third-party integrations.
- This repository's scripts, GitHub Actions workflows, and build and release process.
- Vulnerable dependencies when they affect AI Advocate. Reports about upstream
  vulnerabilities can also go to the dependency maintainer.

Third-party services themselves are outside this policy's scope; flaws in how
AI Advocate uses or configures them remain in scope. Ordinary content corrections,
inaccurate summaries, and feature requests can use GitHub issues when they contain
no private information. If a content problem results from unauthorized access or
another security flaw, report it privately instead.

## Testing boundaries

Use a local environment and synthetic data wherever possible. Test only with sessions,
accounts, devices, and data you control. Do not access, change, download, or delete
other people's data. If you encounter it accidentally, stop and report the minimal
evidence privately.

Do not run load tests, exhaust paid API quotas, trigger bulk ingestion or notifications,
or use social engineering against users or maintainers. Demonstrate a suspected abuse
path with code analysis or a local reproduction instead of exercising it in production.
This policy does not authorize testing third-party systems.

## Supported versions

Security fixes target `main`, the current production web app and backend, and the
latest released mobile app. Older mobile releases do not receive separate patches;
install the latest release to receive client fixes. Reports affecting older versions
are welcome when the issue may still affect a supported version.
