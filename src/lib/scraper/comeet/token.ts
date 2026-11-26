// Comeet boards need two parts, "{slug}/{uid}" (e.g. "Claroty/F2.004"). The
// slug keeps its case as published; the uid is Comeet's "XX.XXX" company id.
// Pure (no network) so the client-imported schema can use it.
export const COMEET_TOKEN_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\/[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}$/;
