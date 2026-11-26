/** Pages rendered without the app's sidebar and padding, e.g. a resume's print view. */
export const isBareRoute = (pathname: string) => /^\/resume\/[^/]+\/print$/.test(pathname);

/**
 * A `from` query value that is safe to send the user to after signing in:
 * a path on this site, never another origin (`https://…`, `//host`, `/\host`).
 */
export const safeRedirectPath = (from: string | null, fallback: string) =>
  from && /^\/(?![/\\])/.test(from) ? from : fallback;
