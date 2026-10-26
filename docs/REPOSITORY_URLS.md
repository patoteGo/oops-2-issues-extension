# Select a repository automatically from the page URL

The extension can select the GitHub repository where you want to report a bug
based on the active browser tab's URL. This was added in [PR #4](https://github.com/patoteGo/oops-2-issues-extension/pull/4).

## Where to add the configuration

Edit [`repo-url-map.json`](../repo-url-map.json) in the root of **this extension
repository**. Add one entry for each repository you want recognized.
You do **not** need to add a file, README field, GitHub setting, or code to
the repositories receiving issues. The extension reads its bundled mapping;
it does not discover URLs from those repositories.

## What to add for each repository

Each entry has:

- A key containing the exact GitHub repository name as shown in the extension's
  dropdown: `owner/repo` (without `https://github.com/` or `.git`).
- An array of URL patterns for pages that should select that repository.
  Include production, staging, local development, and GitHub URLs as needed.

For example, the following is a complete valid mapping for two repositories.
Replace the names and domains with yours, or copy the individual entries into
the existing file. Keep commas between entries; JSON does not allow comments
or trailing commas.

```json
{
  "your-org/storefront": [
    "https://shop.example.com/*",
    "https://staging.shop.example.com/*",
    "http://localhost:3000/*",
    "https://github.com/your-org/storefront",
    "https://github.com/your-org/storefront/*"
  ],
  "your-org/admin": [
    "https://admin.example.com/*",
    "http://localhost:4000/*",
    "https://github.com/your-org/admin",
    "https://github.com/your-org/admin/*"
  ]
}
```

The existing `_schema` object is explanatory metadata, not a repository entry;
you can leave it in place.

## How matching works

- Patterns match the **whole URL**, including the scheme, port, path, query,
  and fragment. Matching is case-insensitive.
- Only `*` is a wildcard. It matches zero or more characters, including `/`.
  Patterns are not regular expressions; `?` is a literal question mark.
- `https://shop.example.com/*` covers every path on that host, including
  query strings and fragments after the slash. HTTP and HTTPS need separate
  patterns, as do different ports.
- An exact pattern without `*` matches only that URL. For GitHub, the two
  patterns in the example cover both the repository root and its subpages.
  A pattern such as `https://github.com/your-org/storefront*` also matches
  similarly named repositories such as `storefront-admin`.
- **First matching repository wins**, in file order. Put specific entries
  before broad entries. For example, put a repository mapped to
  `https://example.com/admin/*` before one mapped to `https://example.com/*`.
  Avoid assigning the same localhost URL to multiple repositories; use
  different ports or paths so the extension can distinguish them.
- The matched repository must already be available in the dropdown. The
  mapping does not grant token access or add repositories to the list.
  Repository keys must match the dropdown's `owner/repo` spelling and case.
- If no pattern matches, or the first matched repository is unavailable,
  the current/default selection stays in place. The extension does not try
  later matching repositories after finding an unavailable first match.

## Apply and verify changes

1. Save `repo-url-map.json` in the extension source.
2. Run `npm run build` to copy the mapping into `dist/`. If dependencies are
   not installed yet, run `npm ci` first. With `npm run watch` running, saving
   the mapping triggers a rebuild automatically.
3. Open `chrome://extensions` and click **Reload** on the extension card.
   Close and reopen its side panel so the cached mapping is loaded again.
4. Connect with a GitHub token that can access the target repository and
   confirm that it appears in the Repository dropdown.
5. Visit a URL from your mapping and open the side panel. Confirm that the
   expected repository is selected. Switch tabs or navigate to another mapped
   page to check another entry; auto-selection runs on tab changes/updates
   when the extension is not busy.

If selection does not change, check the exact URL, the repository key,
overlapping patterns earlier in the file, and JSON syntax. A missing or
unreadable mapping leaves the existing selection in place. Editing only the
source file without rebuilding and reloading does not update an installed
copy. Packaged copies also need to be rebuilt and redistributed to receive
mapping changes.
