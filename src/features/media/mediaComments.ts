import type { MediaItem } from "../../types/media";

export type MediaComment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export type MediaComments = Record<string, MediaComment[]>;

const MEDIA_COMMENT_STORAGE_KEY = "oraedameun.mediaComments";

export function loadMediaComments(): MediaComments {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MEDIA_COMMENT_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([id, entries]) => Array.isArray(entries)
      ? [[id, entries.filter(isMediaComment)]] : []));
  } catch {
    return {};
  }
}

function isMediaComment(value: unknown): value is MediaComment {
  if (!value || typeof value !== "object") return false;
  return ["id", "author", "content", "createdAt"].every((key) => typeof (value as Record<string, unknown>)[key] === "string");
}

export function saveMediaComments(comments: MediaComments) {
  try {
    window.localStorage.setItem(MEDIA_COMMENT_STORAGE_KEY, JSON.stringify(comments));
  } catch {
    // 댓글 저장 실패는 사진 보기 흐름을 막지 않는다.
  }
}

export function getMediaComments(item: MediaItem, comments: MediaComments): MediaComment[] {
  const saved = comments[item.id] ?? [];
  if (saved.length || !item.comment.trim()) return saved;
  return [{
    id: `legacy-comment-${item.id}`,
    author: "나",
    content: item.comment,
    createdAt: "",
  }];
}
