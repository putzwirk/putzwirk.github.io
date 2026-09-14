import { useState, type MouseEvent } from "react";
import { getModAssetUrl } from "../lib/data";

export default function ModGallery({ paths, label = "Screenshots" }: { paths: string[]; label?: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  if (paths.length === 0) return null;
  const urls = paths.map(getModAssetUrl);
  const selected = selectedIndex === null ? null : urls[selectedIndex];
  const showPrevious = (event: MouseEvent) => {
    event.stopPropagation();
    setSelectedIndex((index) => index === null ? null : (index - 1 + urls.length) % urls.length);
  };
  const showNext = (event: MouseEvent) => {
    event.stopPropagation();
    setSelectedIndex((index) => index === null ? null : (index + 1) % urls.length);
  };
  return (
    <>
      <details className="issue-attachments mod-gallery">
        <summary>{label} ({urls.length})</summary>
        <div>{urls.map((url, index) => <button className="attachment-thumb" key={`${url}-${index}`} type="button" onClick={() => setSelectedIndex(index)}><img src={url} alt={`${label} ${index + 1}`} loading="lazy" /></button>)}</div>
      </details>
      {selected && <div className="attachment-lightbox" role="presentation" onClick={() => setSelectedIndex(null)}><button type="button" className="attachment-lightbox-close" onClick={() => setSelectedIndex(null)} aria-label="Close preview">×</button><button type="button" className="attachment-lightbox-nav attachment-lightbox-prev" onClick={showPrevious} aria-label="Previous screenshot">‹</button><img src={selected} alt={`Expanded ${label.toLowerCase()} ${selectedIndex! + 1} of ${urls.length}`} /><button type="button" className="attachment-lightbox-nav attachment-lightbox-next" onClick={showNext} aria-label="Next screenshot">›</button></div>}
    </>
  );
}
