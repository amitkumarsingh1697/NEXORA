# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. If that option is not shown, open an issue that says only that you have a security report and asks the maintainer for a private channel, without any details.

Include what you found, how to reproduce it, and which product it affects (CVForge web app, CVForge extension, CodeAtlas, or ArchLens).

## Supported versions

NEXORA has not had a tagged release yet. Fixes go to the `main` branch.

## Scope and design

The security controls and their tests are described in [documentation/security/SECURITY.md](documentation/security/SECURITY.md), and threats with their mitigations in [documentation/SECURITY_THREAT_MODEL.md](documentation/SECURITY_THREAT_MODEL.md).

Two points matter most when deciding whether something is a vulnerability:

- **CodeAtlas runs a repository's own scripts** (for example `test` or `build`) when you ask it to validate a patch. The allowlist limits which scripts run, not what they do. Running checks on an untrusted repository is running that repository's code.
- **CodeAtlas listens only on 127.0.0.1** and requires a per-installation token. A finding that needs another local user account or malware already on the machine is out of scope.
