import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export type PendingShot = { which: 'before' | 'after'; uri: string; width: number; height: number };

/**
 * Shared before/after photo capture + date/time-stamping logic, used by both the cleaning and
 * MEP job-completion screens. Burns the current date/time into the photo pixels via an
 * off-screen composite + snapshot (see PhotoCaptureOverlay), so the timestamp travels with the
 * image itself rather than living only in a DB column a viewer might miss.
 */
export function usePhotoCapture() {
  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingShot, setPendingShot] = useState<PendingShot | null>(null);
  const shotRef = useRef<View>(null);

  function reset() {
    setBeforeUri(null);
    setAfterUri(null);
    setError(null);
    setPendingShot(null);
  }

  async function takePhoto(which: 'before' | 'after') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to take a photo');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    // Cap the compositing view's size (real camera photos are much larger than needed here -
    // this is just evidence, not a print). Aspect ratio preserved.
    const maxDim = 1080;
    const scale = Math.min(1, maxDim / Math.max(asset.width || maxDim, asset.height || maxDim));
    setPendingShot({
      which,
      uri: asset.uri,
      width: Math.round((asset.width || maxDim) * scale),
      height: Math.round((asset.height || maxDim) * scale),
    });
  }

  useEffect(() => {
    if (!pendingShot) return;
    const timer = setTimeout(async () => {
      try {
        const stampedUri = await captureRef(shotRef, { format: 'jpg', quality: 0.85 });
        if (pendingShot.which === 'before') setBeforeUri(stampedUri);
        else setAfterUri(stampedUri);
      } catch (e) {
        console.error('Failed to stamp photo, using original', e);
        if (pendingShot.which === 'before') setBeforeUri(pendingShot.uri);
        else setAfterUri(pendingShot.uri);
      } finally {
        setPendingShot(null);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingShot]);

  return { beforeUri, afterUri, error, setError, takePhoto, reset, pendingShot, shotRef };
}

export function formatTimestamp(d: Date): string {
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}  ${time}`;
}
