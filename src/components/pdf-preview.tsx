import { useEffect, useRef, useState } from "react";

// Renders a PDF blob to canvases (blob-URL iframes are blocked inside sandboxed previews).
export function PdfPreview({ blob, className }: { blob: Blob; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const host = containerRef.current;
        if (!host) return;
        host.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full rounded-md border bg-background";
          host.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not render preview");
      }
    })();
    return () => { cancelled = true; };
  }, [blob]);

  return (
    <div className={className}>
      {error ? (
        <p className="text-sm text-destructive p-4">{error}</p>
      ) : (
        <div ref={containerRef} className="space-y-3" />
      )}
    </div>
  );
}
