import type { AlbumContent } from "../../../types/media";
import "./written-page.css";

export function AlbumWrittenPage({ page }: { page: AlbumContent }) {
  return <article className={`albumWrittenPage kind-${page.kind.toLowerCase()}`} aria-label={`${page.kind === "CHAPTER" ? "챕터" : "글·일기"}: ${page.title}`}>
    {page.kind === "CHAPTER" && <span className="writtenPageEyebrow">CHAPTER</span>}
    <span className="writtenPageOrnament" aria-hidden="true">✦</span>
    <h3>{page.title}</h3>
    <span className="writtenPageRule" aria-hidden="true" />
    <p>{page.body}</p>
  </article>;
}
