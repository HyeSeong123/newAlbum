import type { CSSProperties } from "react";
import { BookOpen, Check } from "lucide-react";
import type { MediaItem } from "../../types/media";
import { MediaVisual } from "../../components/MediaVisual";
import albumClosedBase from "../../assets/album-front-flat.png";

export const DEFAULT_ALBUM_COLOR = "#E5E1D5";

export const ALBUM_COVER_COLORS = [
  { name: "버건디", value: "#8A2E35" },
  { name: "아이보리", value: "#E5E1D5" },
  { name: "차콜", value: "#414143" },
  { name: "세이지", value: "#D8DDCB" },
  { name: "브라운", value: "#6A4538" },
  { name: "네이비", value: "#2F4058" },
] as const;

export function AlbumCover({ title, items, color = DEFAULT_ALBUM_COLOR, showColor = false }: { title: string; items: MediaItem[]; color?: string; showColor?: boolean }) {
  const cover = items.find((item) => item.fileType === "image") ?? items[0];
  return <span className="frontAlbum" style={{ "--album-color": color, "--album-tint": color.toUpperCase() === DEFAULT_ALBUM_COLOR ? 0 : .3 } as CSSProperties}>
    <img className="frontAlbumBase" src={albumClosedBase} alt="" aria-hidden="true" draggable={false} />
    {showColor && <span className="frontAlbumTone" aria-hidden="true" />}
      <span className="frontAlbumWindow">
        {cover ? <MediaVisual item={cover} /> : <BookOpen size={34} aria-hidden="true" />}
      </span>
      <strong className="frontAlbumTitle"><span>{title}</span></strong>
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
      <span className="albumColorPreview" aria-hidden="true"><AlbumCover title={title} items={items} color={value} showColor /></span>
    </div>
  </fieldset>;
}
