import type { CSSProperties } from "react";
import { BookOpen, Check } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";

export const DEFAULT_ALBUM_COLOR = "#6A4538";

export const ALBUM_COVER_COLORS = [
  { name: "버건디", value: "#8A2E35" },
  { name: "아이보리", value: "#E5E1D5" },
  { name: "차콜", value: "#414143" },
  { name: "세이지", value: "#D8DDCB" },
  { name: "브라운", value: DEFAULT_ALBUM_COLOR },
  { name: "네이비", value: "#2F4058" },
] as const;

export function AlbumCover({ title, items, color = DEFAULT_ALBUM_COLOR }: { title: string; items: MediaItem[]; color?: string }) {
  const cover = items.find((item) => item.fileType === "image") ?? items[0];
  return <span className="frontAlbum" style={{ "--album-color": color } as CSSProperties}>
    <span className="frontAlbumPages" aria-hidden="true" />
    <span className="frontAlbumCover">
      <span className="frontAlbumSpine" aria-hidden="true" />
      <span className="frontAlbumWindow">
        {cover ? <MediaVisual item={cover} /> : <BookOpen size={34} aria-hidden="true" />}
      </span>
      <strong className="frontAlbumTitle"><span>{title}</span></strong>
    </span>
  </span>;
}

export function AlbumColorPicker({ value, onChange, items, title }: { value: string; onChange: (value: string) => void; items: MediaItem[]; title: string }) {
  return <fieldset className="albumColorPicker">
    <legend>앨범 색상</legend>
    <div className="albumColorLayout">
      <div className="albumColorOptions">
        {ALBUM_COVER_COLORS.map((color) => <button type="button" key={color.value} title={color.name} aria-label={`${color.name} 색상`} aria-pressed={value.toUpperCase() === color.value} style={{ backgroundColor: color.value }} onClick={() => onChange(color.value)}>
          {value.toUpperCase() === color.value && <Check size={17} strokeWidth={3} />}
        </button>)}
        <label className="customAlbumColor">직접 선택<input aria-label="직접 색상 선택" type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>
      </div>
      <span className="albumColorPreview" aria-hidden="true"><AlbumCover title={title} items={items} color={value} /></span>
    </div>
  </fieldset>;
}
