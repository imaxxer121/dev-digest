# L07 CI gate fixture

This isolated teaching example treats `request.query.name` as raw untrusted HTTP
input. It is used to observe a real model review, a grounded CRITICAL finding and
GitHub's required-check merge gate. The first revision deliberately constructs
SQL through concatenation; the next revision binds the input as a parameter.

The application never imports or executes this directory. Review results must
come from the hosted model and reviewer-core, rather than a fabricated finding.

The internal-PR context repair is now installed on the trusted base. This
revision reruns the unchanged vulnerable query through that repaired runner.
