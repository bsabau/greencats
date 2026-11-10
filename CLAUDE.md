# Rules for agents working on this repository

## Review before every pull request or merge

Before opening a pull request, and before merging any branch into another, get a code review
from opencode with the Muse Spark 1.3 model. Run it from the branch being reviewed:

```bash
git diff main...HEAD > "$TMPDIR/review.diff"
opencode run -m opencode-go/muse-spark-1.3-contributor -f "$TMPDIR/review.diff" \
  "Review this diff of the Green Cats shelter app. Report only concrete problems: bugs, \
security or privacy issues, data loss, broken migrations, missing translations. \
For each one give the file, the line and what goes wrong."
```

- Replace `main` with the target branch when it is a different one.
- Fix each problem it reports, or write down why it is not a problem. Do this before the PR
  is opened or the merge is done.
- Put a short summary of the review and what was done about it in the PR description, or in
  the merge commit message.
- The reviewer is an external service. Give it only the diff and the code. Never pass it the
  workbook (`import/`), `.env`, `uploads/`, `backups/`, `test-results/` or any real shelter
  data, and do not run it with `--auto`.
