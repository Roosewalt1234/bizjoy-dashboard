import { useEffect, useState } from 'react';

import { onScanned, wasScannedRecently } from '@/lib/scan-tracker';

/**
 * Whether `token`'s tag was tapped recently, kept live instead of a one-time snapshot.
 * A plain `wasScannedRecently()` check at mount time can run before the async
 * Linking 'url' event for the tap that opened this very screen has finished
 * processing, so it reads false even for a genuine tap - this re-checks on mount
 * and again whenever a matching scan comes in afterwards.
 *
 * `token` may be null for flows with no physical tag to verify against (e.g. a
 * reactive work order with no linked asset) - always verified in that case.
 */
export function useNfcVerified(token: string | null): boolean {
  const [verified, setVerified] = useState(() => (token ? wasScannedRecently(token) : true));

  useEffect(() => {
    if (!token) {
      setVerified(true);
      return;
    }
    setVerified(wasScannedRecently(token));
    return onScanned(token, () => setVerified(true));
  }, [token]);

  return verified;
}
