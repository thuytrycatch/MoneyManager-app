# Releasing

This app uses an **international-standard, push-to-release** flow:

- **Versioning:** [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) — `MAJOR.MINOR.PATCH`.
- **Source of truth:** your **commit messages**, written as
  [Conventional Commits](https://www.conventionalcommits.org/).
- **Trigger:** every push to `main` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml),
  which computes the next version, tags it, stamps it into the app, and publishes a GitHub Release.

You never edit a version number by hand.

## How the version is decided

The workflow reads every commit since the last `vX.Y.Z` tag and picks the largest bump:

| Commit message            | Example                                  | Bump            |
| ------------------------- | ---------------------------------------- | --------------- |
| `fix: …`                  | `fix: login toast hidden behind screen`  | PATCH `1.0.1`   |
| `feat: …`                 | `feat: net-worth report`                 | MINOR `1.1.0`   |
| `feat!: …` or footer with `BREAKING CHANGE:` | `feat!: drop JSON storage` | MAJOR `2.0.0`   |
| `chore:`/`docs:`/`refactor:`/`style:`/`test:`/`perf:` | `chore: cache-bust assets` | PATCH (default) |

### Commit format

```
<type>[optional scope]: <short summary>

[optional body]

[optional BREAKING CHANGE: description]
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `style`, `ci`.

Examples:
```
feat(reports): add weekly spending forecast
fix(parser): handle "2 triệu rưỡi"
feat!: require Supabase (remove GitHub-JSON storage)
```

## What happens on each push to `main`

1. Compute the next SemVer from the commits.
2. Rewrite the `?v=` cache-bust in `index.html` and `version.json` to the new version
   (a bot commit `chore(release): vX.Y.Z [skip ci]` — it does **not** re-trigger the workflow).
3. Create and push the `vX.Y.Z` tag.
4. Publish a **GitHub Release** with an auto-generated changelog.
5. GitHub Pages redeploys `main` automatically with fresh, correctly-versioned assets.

## One-time GitHub setup

In the repo: **Settings → Actions → General → Workflow permissions** →
select **Read and write permissions** → Save. (Lets the workflow push the tag/bump
and create the Release.)

## Day-to-day

Just commit with a Conventional-Commit message and push to `main`. That's the whole process:

```bash
git commit -m "feat: add CSV export"
git push origin main
# -> Actions tags v1.1.0, publishes the Release, Pages redeploys.
```

## Pre-releases (optional extension)

To cut betas from a feature branch, push a tag like `v1.2.0-beta.1` manually, or extend
the workflow with a `branches: [next]` trigger and `prerelease: true` on the Release step.
