# Repo explainers go to the library

Installed by `repo-explainer install`. Applies in every project.

- **Build with the CLI.** Make every repo explainer with the repo-explainer skill and its CLI (`repo-explainer build`). A successful build also publishes it to the library.
- **Keep the source in the repo.** The data lives at `<repo>/.explainer/explainer.json`. Update that file and rebuild. Do not start over.
- **Never hand-write explainer HTML** anywhere else, and never copy a built page around by hand. If a page is wrong, fix the data and rebuild.
- **Point the user at the hub.** After a build, tell them the library hub path: `~/.repo-explainer/index.html`, or `$REPO_EXPLAINER_HOME/index.html` when that is set. `repo-explainer library path` prints it.
- **Skip the library only when asked.** Pass `--no-library` for a throwaway build, such as a test or a one-off preview.
