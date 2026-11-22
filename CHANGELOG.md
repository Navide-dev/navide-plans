# Changelog

## 1.1.11

### Fixed

- The plan preview no longer re-renders after a review note or other
  plan-meta-only write. The write comes back as a `plans.changed` reload; when
  the re-read document differs only in its `plan-meta` island, the preview keeps
  the frame it rendered (same document token, no flash).
