import type { AlbumContent } from "../../../types/media";
import "./written-page.css";

export function AlbumWrittenPage({ page }: { page: AlbumContent }) {
  return <article className={`albumWrittenPage kind-${page.kind.toLowerCase()}`} aria-label={`${page.kind === "CHAPTER" ? "챕터" : "글 페이지"}: ${page.title}`}>
    <span className="writtenPageEyebrow">{page.kind === "CHAPTER" ? "CHAPTER" : "JOURNAL"}</span>
    <h3>{page.title}</h3>
    <p>{page.body}</p>
  </article>;
}
