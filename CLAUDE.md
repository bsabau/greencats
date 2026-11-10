# Rules for agents working on this repository

## Review before every pull request or merge

Before opening a pull request, and before merging any branch into another, get a code review
from a second model that is not made by Anthropic, for example Muse Spark 1.3 or DeepSeek.

Prepare the diff and a clean copy of the branch, which holds only the files tracked by git:

```bash
R="$TMPDIR/greencats-review"; rm -rf "$R"; mkdir -p "$R"
git archive HEAD | tar -x -C "$R"
git diff main...HEAD -- . ':!drizzle/meta' > "$R/REVIEW.diff"
```

Ask the reviewer: "Review the changes in this diff. Report only concrete problems: bugs,
security or privacy issues, data loss, broken migrations, missing translations. For each one
give the file, the line and what goes wrong."

- Use any non-Anthropic model that is available, for example Muse Spark 1.3 or DeepSeek.
- Replace `main` with the target branch when it is a different one.
- Fix each problem it reports, or write down why it is not a problem. Do this before the PR
  is opened or the merge is done.
- Put a short summary of the review in the PR description or the merge commit message, and
  name the model that did it.
- The reviewer is an external service. Never give it the workbook (`import/`), `.env`,
  `uploads/`, `backups/`, `test-results/` or any real shelter data.
- A clean copy is not enough on its own. `opencode run` gives the model a shell and file access
  on this machine even without `--auto`, and a deny-all permission config did not stop it: on
  2026-11-10 a DeepSeek review left the copy, read `.env` and queried the Docker database.
  Until the reviewer runs in a sandbox that only sees the copy (for example a container with
  just that folder mounted and no Docker socket), do not run an agent CLI as the reviewer.
  Give the model only the diff, in a chat without tools, and paste its answer back.
