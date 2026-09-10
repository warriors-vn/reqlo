import { useEffect, useState } from "react";

/** An object URL for a response blob, revoked when the blob changes or the
 * viewer unmounts — image and PDF previews need a URL, and leaking them
 * pins the whole response in memory for the life of the tab. */
export function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
