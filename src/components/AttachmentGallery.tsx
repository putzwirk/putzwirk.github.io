import { useState, type MouseEvent } from "react";

export default function AttachmentGallery({ urls }: { urls: string[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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
      <details className="issue-attachments">
        <summary>Attachments ({urls.length})</summary>
        <div>{urls.map((url, index) => <button className="attachment-thumb" key={`${url}-${index}`} type="button" onClick={() => setSelectedIndex(index)}><img src={url} alt={`Attachment ${index + 1}`} loading="lazy" /></button>)}</div>
      </details>
      {selected && <div className="attachment-lightbox" role="presentation" onClick={() => setSelectedIndex(null)}><button type="button" className="attachment-lightbox-close" onClick={() => setSelectedIndex(null)} aria-label="Close image">×</button><button type="button" className="attachment-lightbox-nav attachment-lightbox-prev" onClick={showPrevious} aria-label="Previous image">‹</button><img src={selected} alt={`Expanded attachment ${selectedIndex! + 1} of ${urls.length}`} /><button type="button" className="attachment-lightbox-nav attachment-lightbox-next" onClick={showNext} aria-label="Next image">›</button></div>}
    </>
  );
}
