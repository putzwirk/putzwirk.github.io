import { useEffect, useState, type MouseEvent } from "react";
import { isVideoAttachmentUrl, signIssueAttachmentUrls } from "../lib/issueAttachments";

export default function AttachmentGallery({ urls }: { urls: string[] }) {
  const [resolved, setResolved] = useState<string[]>(urls);
  const urlsKey = urls.join("\n");
  useEffect(() => {
    let active = true;
    signIssueAttachmentUrls(urls)
      .then((next) => { if (active) setResolved(next); })
      .catch(() => { if (active) setResolved(urls); });
    return () => { active = false; };
  }, [urlsKey]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex === null ? null : resolved[selectedIndex];
  const selectedIsVideo = selected !== null && isVideoAttachmentUrl(selected);
  const showPrevious = (event: MouseEvent) => {
    event.stopPropagation();
    setSelectedIndex((index) => index === null ? null : (index - 1 + resolved.length) % resolved.length);
  };
  const showNext = (event: MouseEvent) => {
    event.stopPropagation();
    setSelectedIndex((index) => index === null ? null : (index + 1) % resolved.length);
  };
  return (
    <>
      <details className="issue-attachments">
        <summary>Attachments ({resolved.length})</summary>
        <div>{resolved.map((url, index) => isVideoAttachmentUrl(url) ? <button className="attachment-thumb" key={`${url}-${index}`} type="button" onClick={() => setSelectedIndex(index)}><video src={url} preload="metadata" aria-label={`Video attachment ${index + 1}`} /></button> : <button className="attachment-thumb" key={`${url}-${index}`} type="button" onClick={() => setSelectedIndex(index)}><img src={url} alt={`Attachment ${index + 1}`} loading="lazy" /></button>)}</div>
      </details>
      {selected && <div className="attachment-lightbox" role="presentation" onClick={() => setSelectedIndex(null)}><button type="button" className="attachment-lightbox-close" onClick={() => setSelectedIndex(null)} aria-label="Close preview">×</button><button type="button" className="attachment-lightbox-nav attachment-lightbox-prev" onClick={showPrevious} aria-label="Previous attachment">‹</button>{selectedIsVideo ? <video src={selected} controls autoPlay aria-label={`Expanded video attachment ${selectedIndex! + 1} of ${resolved.length}`} /> : <img src={selected} alt={`Expanded attachment ${selectedIndex! + 1} of ${resolved.length}`} />}<button type="button" className="attachment-lightbox-nav attachment-lightbox-next" onClick={showNext} aria-label="Next attachment">›</button></div>}
    </>
  );
}
