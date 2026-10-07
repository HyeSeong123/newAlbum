import { Pencil } from "lucide-react";
import type { AlbumContent } from "../../../types/media";
import "./written-page.css";

export function AlbumWrittenPage({ page, onEdit }: { page: AlbumContent; onEdit?: () => void }) {
  return <article className={`albumWrittenPage kind-${page.kind.toLowerCase()}`} aria-label={`${page.kind === "CHAPTER" ? "챕터" : "편지"}: ${page.title}`}>
    {page.kind === "CHAPTER" && <span className="writtenPageEyebrow">CHAPTER</span>}
    <span className="writtenPageOrnament" aria-hidden="true">✦</span>
    <h3>{page.title}</h3>
    <span className="writtenPageRule" aria-hidden="true" />
    <p>{page.body}</p>
    {onEdit && <button className="writtenPageEdit" onClick={onEdit} aria-label={`${page.kind === "CHAPTER" ? "챕터" : "편지"} 상세보기`}><Pencil size={15} />수정</button>}
  </article>;
}
