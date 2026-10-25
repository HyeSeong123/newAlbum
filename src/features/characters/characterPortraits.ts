// User-supplied originals are displayed by viewBox, without redrawing or altering the artwork.
// Stable character IDs retain all existing ownership, names, affection and growth records.
export type CharacterPortrait = { src: string; viewBox: string; width: number; height: number; subject: string; clip?: string };
const sheet = (name: string, viewBox: string, subject: string): CharacterPortrait => ({ src: `/characters/portraits/${name}.png`, viewBox, width: 1122, height: 1402, subject });
export const characterPortraits: Record<string, CharacterPortrait> = {
  ginkgo: sheet("regions-a", "85 50 455 450", "컵라면"),
  camellia: sheet("regions-a", "580 115 490 400", "갈매기"),
  magnolia: sheet("regions-a", "85 500 465 400", "해님"),
  "sea-lavender": sheet("regions-a", "590 550 490 370", "짜장면"),
  apple: { ...sheet("regions-c", "10 775 395 470", "하회탈"), clip: "10,775 405,775 405,905 365,930 370,1110 350,1245 10,1245" },
  grape: sheet("regions-a", "600 960 470 410", "소보로"),
  pear: sheet("regions-b", "45 65 555 430", "고래"),
  rose: sheet("regions-b", "60 520 500 370", "치킨"),
  jujube: sheet("regions-b", "105 900 420 440", "호두"),
  chestnut: sheet("regions-b", "665 875 380 480", "인삼"),
  barley: sheet("regions-c", "100 280 510 450", "비빔밥"),
  persimmon: { ...sheet("regions-c", "365 800 400 445", "벚꽃"), clip: "460,800 765,800 765,1245 365,1245 365,975 460,900" },
  orange: sheet("regions-c", "760 840 350 420", "귤"),
  "sweet-potato": { src: "/characters/portraits/sweet-potato.png", viewBox: "0 0 415 695", width: 415, height: 695, subject: "고구마" },
  potato: { src: "/characters/portraits/potato-source.png", viewBox: "785 270 580 540", width: 1536, height: 1024, subject: "감자" },
  peach: { src: "/characters/portraits/hangul-giraffe.png", viewBox: "100 45 1090 1170", width: 1254, height: 1254, subject: "한글" },
};
