/** Pages rendered without the app's sidebar and padding, e.g. a resume's print view. */
export const isBareRoute = (pathname: string) => /^\/resume\/[^/]+\/print$/.test(pathname);
