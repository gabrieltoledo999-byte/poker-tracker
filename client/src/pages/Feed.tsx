import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { OnlinePresenceDot, OnlinePresenceLabel } from "@/components/OnlinePresence";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildProfilePath } from "@/lib/socialProfile";
import { useLocation } from "wouter";
import {
  Activity,
  Bookmark,
  Heart,
  MessageCircle,
  ImagePlus,
  Send,
  Trash2,
  Globe,
  Users,
  ChevronDown,
  ChevronUp,
  Flame,
  MoreHorizontal,
  Edit2,
  X,
} from "lucide-react";
import { toast } from "sonner";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const COMMUNITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function extractBase64Payload(dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  const payload = dataUrl.slice(commaIndex + 1).trim();
  return payload.length > 0 ? payload : null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function normalizeCommunityImage(file: File): Promise<{ blob: Blob; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { blob: file, mimeType: file.type || "image/jpeg" };
    }
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.8);
    });

    if (!blob) {
      return { blob: file, mimeType: file.type || "image/jpeg" };
    }

    return { blob, mimeType: "image/jpeg" };
  } catch {
    // Mobile browsers may fail to decode camera formats (ex: HEIC); keep a safe fallback.
    return { blob: file, mimeType: file.type || "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobToBase64Payload(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return "";
  return dataUrl.slice(commaIndex + 1).trim();
}

function CommentSection({ postId, currentUserId }: { postId: number; currentUserId: number }) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();

  const { data: comments, isLoading } = trpc.feed.getComments.useQuery({ postId });

  const addComment = trpc.feed.addComment.useMutation({
    onSuccess: () => {
      setText("");
      utils.feed.getComments.invalidate({ postId });
      utils.feed.list.invalidate();
    },
    onError: () => toast.error("Erro ao comentar"),
  });

  const deleteComment = trpc.feed.deleteComment.useMutation({
    onSuccess: () => {
      utils.feed.getComments.invalidate({ postId });
      utils.feed.list.invalidate();
    },
  });

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        comments?.map((c) => (
          <div key={c.comment.id} className="flex gap-2 items-start group">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={c.author.avatarUrl ?? undefined} />
              <AvatarFallback className="text-xs">
                {(c.author.name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 rounded-2xl bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold">{c.author.name ?? "Jogador"}</p>
              <p className="text-sm mt-0.5 break-words">{c.comment.content}</p>
            </div>
            {c.author.id === currentUserId && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => deleteComment.mutate({ id: c.comment.id })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))
      )}

      <div className="flex gap-2 mt-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva um comentário..."
          className="min-h-[36px] max-h-24 text-sm resize-none"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) addComment.mutate({ postId, content: text.trim() });
            }
          }}
        />
        <Button
          size="icon"
          disabled={!text.trim() || addComment.isPending}
          onClick={() => addComment.mutate({ postId, content: text.trim() })}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const REACTIONS = ["🔥", "👏", "😂", "😮", "😢", "🎯"] as const;

function PostCard({ post, currentUserId, onOpenProfile }: { post: any; currentUserId: number; onOpenProfile: (author: { id: number; name?: string | null }) => void }) {
  const [showComments, setShowComments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGestureLike, setShowGestureLike] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content ?? "");
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const likeFlashTimeoutRef = useRef<number | null>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    setDraftContent(post.content ?? "");
  }, [post.content]);

  useEffect(() => {
    return () => {
      if (likeFlashTimeoutRef.current) {
        window.clearTimeout(likeFlashTimeoutRef.current);
      }
    };
  }, []);

  const toggleLike = trpc.feed.toggleLike.useMutation({
    onMutate: async () => {
      await utils.feed.list.cancel();
      const prev = utils.feed.list.getData();
      utils.feed.list.setData(undefined, (old) =>
        old?.map((p: any) =>
          p.id === post.id
            ? {
                ...p,
                likedByMe: !p.likedByMe,
                likeCount: p.likedByMe ? p.likeCount - 1 : p.likeCount + 1,
              }
            : p
        )
      );
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) utils.feed.list.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.feed.list.invalidate(),
  });

  const toggleReaction = trpc.feed.toggleReaction.useMutation({
    onMutate: async ({ emoji }) => {
      await utils.feed.list.cancel();
      const prev = utils.feed.list.getData();
      utils.feed.list.setData(undefined, (old) =>
        old?.map((p: any) => {
          if (p.id !== post.id) return p;
          const prevEmoji = p.myReaction as string | null;
          let summary: { emoji: string; count: number }[] = [...(p.reactionSummary ?? [])];
          // remove previous if diff
          if (prevEmoji && prevEmoji !== emoji) {
            summary = summary
              .map((r: any) => r.emoji === prevEmoji ? { ...r, count: r.count - 1 } : r)
              .filter((r: any) => r.count > 0);
          }
          // toggle current
          if (prevEmoji === emoji) {
            summary = summary
              .map((r: any) => r.emoji === emoji ? { ...r, count: r.count - 1 } : r)
              .filter((r: any) => r.count > 0);
            return { ...p, myReaction: null, reactionSummary: summary };
          } else {
            const existing = summary.find((r: any) => r.emoji === emoji);
            if (existing) {
              summary = summary.map((r: any) => r.emoji === emoji ? { ...r, count: r.count + 1 } : r);
            } else {
              summary = [...summary, { emoji, count: 1 }];
            }
            return { ...p, myReaction: emoji, reactionSummary: summary };
          }
        })
      );
      setShowEmojiPicker(false);
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) utils.feed.list.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.feed.list.invalidate(),
  });

  const deletePost = trpc.feed.delete.useMutation({
    onSuccess: () => {
      utils.feed.list.invalidate();
      toast.success("Post excluído");
    },
  });

  const updatePost = trpc.feed.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.feed.list.invalidate();
      toast.success("Post atualizado");
    },
    onError: (err) => {
      toast.error("Erro ao editar post", { description: err.message });
    },
  });

  const playGestureLikeFlash = () => {
    setShowGestureLike(true);
    if (likeFlashTimeoutRef.current) {
      window.clearTimeout(likeFlashTimeoutRef.current);
    }
    likeFlashTimeoutRef.current = window.setTimeout(() => {
      setShowGestureLike(false);
      likeFlashTimeoutRef.current = null;
    }, 650);
  };

  const triggerGestureLike = () => {
    if (!post.likedByMe && !toggleLike.isPending) {
      toggleLike.mutate({ postId: post.id });
    }
    playGestureLikeFlash();
  };

  const shouldIgnoreGestureTarget = (target: EventTarget | null) => {
    return target instanceof Element && Boolean(target.closest('[data-no-double-like="true"]'));
  };

  const handleDoubleClickLike = (event: React.MouseEvent<HTMLElement>) => {
    if (shouldIgnoreGestureTarget(event.target)) return;
    triggerGestureLike();
  };

  const handleTouchEndLike = (event: React.TouchEvent<HTMLElement>) => {
    if (shouldIgnoreGestureTarget(event.target)) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const now = Date.now();
    const previousTap = lastTapRef.current;
    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    if (!previousTap) return;

    const delta = now - previousTap.time;
    const deltaX = Math.abs(touch.clientX - previousTap.x);
    const deltaY = Math.abs(touch.clientY - previousTap.y);

    if (delta > 0 && delta < 420 && deltaX < 28 && deltaY < 28) {
      triggerGestureLike();
      lastTapRef.current = null;
    }
  };

  return (
    <article className="social-post p-3 md:p-4" onDoubleClick={handleDoubleClickLike} onTouchEnd={handleTouchEndLike}>
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <button
            type="button"
            data-no-double-like="true"
            className="flex items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/40"
            onClick={() => {
              const authorId = Number(post.author?.id ?? 0);
              if (Number.isFinite(authorId) && authorId > 0) {
                onOpenProfile({ id: authorId, name: post.author?.name ?? null });
              }
            }}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.author?.avatarUrl ?? undefined} />
              <AvatarFallback className="text-sm font-semibold">
                {(post.author?.name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">{post.author?.name ?? "Jogador"}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{timeAgo(post.createdAt)}</span>
                <span>·</span>
                {post.visibility === "public" ? (
                  <Globe className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            {post.author?.id === currentUserId ? (
              <>
              <Button
                size="icon"
                variant="ghost"
                data-no-double-like="true"
                className="h-8 w-8 rounded-full text-muted-foreground"
                onClick={() => {
                  setDraftContent(post.content ?? "");
                  setIsEditing((prev) => !prev);
                }}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                data-no-double-like="true"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                onClick={() => deletePost.mutate({ id: post.id })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              </>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              data-no-double-like="true"
              className="h-8 w-8 rounded-full text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {(post.content?.trim() || post.imageUrl) && (
          <div
            className="relative mb-3 select-none"
          >
            {post.imageUrl && (
              <div className="overflow-hidden rounded-[0.8rem] bg-muted flex items-center justify-center border border-white/8">
                <img
                  src={post.imageUrl}
                  alt="Imagem do post"
                  className="mx-auto w-full max-h-[620px] object-contain"
                />
              </div>
            )}

            {showGestureLike && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Heart className="h-16 w-16 animate-in zoom-in-75 fade-in duration-200 fill-rose-500 text-rose-500 drop-shadow-[0_8px_20px_rgba(244,63,94,0.45)]" />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2" data-no-double-like="true">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <button
              className={`flex items-center gap-1.5 transition-colors hover:text-rose-500 ${
                post.likedByMe ? "text-rose-500" : ""
              }`}
              onClick={() => toggleLike.mutate({ postId: post.id })}
            >
              <Heart className={`h-5 w-5 ${post.likedByMe ? "fill-rose-500" : ""}`} />
            </button>
            <button
              className="flex items-center gap-1.5 transition-colors hover:text-primary"
              onClick={() => setShowComments((v) => !v)}
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <button
              className={`flex items-center gap-1.5 transition-colors hover:text-yellow-500 ${showEmojiPicker ? "text-yellow-500" : ""}`}
              onClick={() => setShowEmojiPicker((v) => !v)}
              title="Reagir"
            >
              <Send className="h-5 w-5" />
            </button>
            <button className="ml-auto text-muted-foreground transition-colors hover:text-foreground">
              <Bookmark className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-foreground">{post.likeCount ?? 0} curtidas</p>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="min-h-[80px] resize-none rounded-xl border-white/10 bg-white/[0.03]"
                  maxLength={1000}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftContent(post.content ?? "");
                      setIsEditing(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={updatePost.isPending || draftContent.trim() === (post.content ?? "").trim()}
                    onClick={() => updatePost.mutate({ id: post.id, content: draftContent })}
                  >
                    {updatePost.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            ) : post.content?.trim() ? (
              <p className="leading-relaxed text-foreground/95 whitespace-pre-wrap break-words">
                <span className="mr-1 font-semibold">{post.author?.name ?? "Jogador"}</span>
                {post.content}
              </p>
            ) : null}
            <button
              type="button"
              className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Ocultar comentários" : `Ver comentários (${post.commentCount ?? 0})`}
            </button>
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="flex items-center gap-1 flex-wrap">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction.mutate({ postId: post.id, emoji })}
                  className={`text-xl leading-none px-2 py-1 rounded-full transition-all hover:scale-125 ${
                    post.myReaction === emoji
                      ? "bg-yellow-100 dark:bg-yellow-900/40 ring-1 ring-yellow-400"
                      : "hover:bg-muted"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Reaction Summary */}
          {(post.reactionSummary?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {(post.reactionSummary as { emoji: string; count: number }[]).map(({ emoji, count }) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction.mutate({ postId: post.id, emoji })}
                  className={`flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    post.myReaction === emoji
                      ? "bg-yellow-100 border-yellow-400 dark:bg-yellow-900/40 dark:border-yellow-600"
                      : "bg-muted border-transparent hover:border-border"
                  }`}
                >
                  <span className="text-sm">{emoji}</span>
                  <span className="font-medium">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        {showComments && (
          <div data-no-double-like="true">
            <CommentSection postId={post.id} currentUserId={currentUserId} />
          </div>
        )}
    </article>
  );
}

function NewPostForm({ currentUserId }: { currentUserId: number }) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageBlobRef = useRef<Blob | null>(null);
  const imageMimeRef = useRef<string>("image/jpeg");
  const imagePreviewUrlRef = useRef<string | null>(null);
  const utils = trpc.useUtils();

  const clearImage = () => {
    imageBlobRef.current = null;
    imageMimeRef.current = "image/jpeg";
    if (imagePreviewUrlRef.current) {
      try {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      } catch {
        /* noop */
      }
      imagePreviewUrlRef.current = null;
    }
    setImagePreview(null);
    setHasImage(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        try {
          URL.revokeObjectURL(imagePreviewUrlRef.current);
        } catch {
          /* noop */
        }
        imagePreviewUrlRef.current = null;
      }
    };
  }, []);

  const uploadImage = trpc.upload.postImage.useMutation();
  const createPost = trpc.feed.create.useMutation({
    onSuccess: () => {
      setContent("");
      clearImage();
      utils.feed.list.invalidate();
      toast.success("Post publicado!");
    },
    onError: () => toast.error("Erro ao publicar post"),
  });

  const processImageFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Somente imagens são suportadas.");
      return;
    }
    if (file.size > COMMUNITY_IMAGE_MAX_BYTES) {
      toast.error("Imagem muito grande (máx. 10MB)");
      return;
    }
    try {
      const normalized = await normalizeCommunityImage(file);
      imageBlobRef.current = normalized.blob;
      imageMimeRef.current = normalized.mimeType;

      if (imagePreviewUrlRef.current) {
        try {
          URL.revokeObjectURL(imagePreviewUrlRef.current);
        } catch {
          /* noop */
        }
      }
      const previewUrl = URL.createObjectURL(normalized.blob);
      imagePreviewUrlRef.current = previewUrl;
      setImagePreview(previewUrl);
      setHasImage(true);
    } catch {
      toast.error("Nao foi possivel processar a imagem selecionada.");
    }
  };

  const safeProcessImageFile = (file: File) => {
    try {
      processImageFile(file).catch(() => {
        toast.error("Nao foi possivel processar a imagem selecionada.");
      });
    } catch {
      toast.error("Nao foi possivel processar a imagem selecionada.");
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      safeProcessImageFile(file);
    } catch {
      toast.error("Nao foi possivel ler o arquivo selecionado.");
    } finally {
      // Permite escolher o mesmo arquivo novamente caso o usuário queira.
      if (e.target) e.target.value = "";
    }
  };

  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const items = e.clipboardData?.items;
      if (!items?.length) return;

      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            safeProcessImageFile(file);
            return;
          }
        }
      }
    } catch {
      toast.error("Nao foi possivel processar a imagem colada.");
    }
  };

  const handleDropImage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    try {
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      safeProcessImageFile(file);
    } catch {
      toast.error("Nao foi possivel processar a imagem solta.");
    }
  };

  const handleSubmit = async () => {
    try {
      const trimmedContent = content.trim();
      const blob = imageBlobRef.current;
      if (!trimmedContent && !blob) return;
      let imageUrl: string | undefined;
      let imageKey: string | undefined;
      if (blob) {
        try {
          const base64 = await blobToBase64Payload(blob);
          if (!base64) {
            throw new Error("Imagem inválida no envio. Tente outra foto.");
          }
          const uploaded = await uploadImage.mutateAsync({
            base64,
            mimeType: imageMimeRef.current,
          });
          imageUrl = uploaded.url;
          imageKey = uploaded.key;
        } catch (error: any) {
          const message =
            typeof error?.message === "string" && error.message.trim().length > 0
              ? error.message
              : "Falha ao enviar imagem. Verifique a configuração de armazenamento.";
          if (trimmedContent) {
            toast.warning(`${message} Publicando somente o texto.`);
            clearImage();
          } else {
            toast.error(message);
            return;
          }
        }
      }
      createPost.mutate({ content: trimmedContent, visibility, imageUrl, imageKey });
    } catch {
      toast.error("Falha inesperada ao publicar. Tente novamente.");
    }
  };

  useEffect(() => {
    const openComposer = () => {
      const target = document.getElementById("feed-create-post-card");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      textareaRef.current?.focus();
    };

    if (localStorage.getItem("social-open-create-post") === "1") {
      localStorage.removeItem("social-open-create-post");
      window.setTimeout(openComposer, 80);
    }

    window.addEventListener("social:open-create-post", openComposer);
    return () => window.removeEventListener("social:open-create-post", openComposer);
  }, []);

  return (
    <div
      id="feed-create-post-card"
      className={`social-post space-y-3 p-3 transition-colors md:p-4 ${isDraggingImage ? "border-dashed border-primary/60 bg-primary/5" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingImage(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingImage(false);
        }}
        onDrop={handleDropImage}
      >
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePasteImage}
          placeholder="Compartilhe um resultado, uma mão interessante ou uma conquista..."
          className="min-h-[76px] resize-none rounded-xl border-white/10 bg-white/[0.03] px-3 py-2.5"
          maxLength={1000}
        />

        {isDraggingImage && (
          <div className="rounded-md border border-dashed border-primary/40 bg-background/80 p-3 text-center text-xs text-muted-foreground">
            Solte a imagem aqui para anexar ao post
          </div>
        )}

        {imagePreview && (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 rounded-lg object-contain"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => {
                clearImage();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="gap-1.5 rounded-full border-white/10 bg-transparent"
            >
              <ImagePlus className="h-4 w-4" />
              Foto
            </Button>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as "public" | "friends")}
            >
              <SelectTrigger className="h-9 w-32 rounded-full border-white/10 bg-transparent text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <span className="flex items-center gap-2">
                    <Globe className="h-3 w-3" /> Público
                  </span>
                </SelectItem>
                <SelectItem value="friends">
                  <span className="flex items-center gap-2">
                    <Users className="h-3 w-3" /> Amigos
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={(!content.trim() && !hasImage) || createPost.isPending || uploadImage.isPending}
            className="gap-1.5 rounded-full px-4"
          >
            <Send className="h-4 w-4" />
            {createPost.isPending || uploadImage.isPending ? "Publicando..." : "Publicar"}
          </Button>
        </div>
    </div>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: posts, isLoading } = trpc.feed.list.useQuery();
  const { data: friends = [] } = trpc.ranking.friends.useQuery(undefined, {
    enabled: !!user?.id,
    staleTime: 15000,
  });
  const { data: conversations = [] } = trpc.chat.conversations.useQuery(undefined, {
    enabled: !!user?.id,
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const { data: globalHandPatternStats, isLoading: loadingGlobalHandStats } = trpc.feed.handPatternStats.useQuery({ limit: 50, minHands: 1 });
  const [scope, setScope] = useState<"global" | "friends">("global");

  useEffect(() => {
    if (!user?.id) return;

    const openMyProfile = () => {
      setLocation(buildProfilePath({ id: user.id, name: user.name }));
    };

    if (localStorage.getItem("social-open-my-profile") === "1") {
      localStorage.removeItem("social-open-my-profile");
      openMyProfile();
    }

    window.addEventListener("social:open-my-profile", openMyProfile);
    return () => window.removeEventListener("social:open-my-profile", openMyProfile);
  }, [setLocation, user?.id, user?.name]);

  useEffect(() => {
    const savedScope = localStorage.getItem("social-feed-scope");
    if (savedScope === "friends" || savedScope === "global") {
      setScope(savedScope);
      localStorage.removeItem("social-feed-scope");
    }
  }, []);

  useEffect(() => {
    const onSetScope = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const nextScope = customEvent.detail;
      if (nextScope === "friends" || nextScope === "global") {
        setScope(nextScope);
      }
    };

    window.addEventListener("social:set-feed-scope", onSetScope as EventListener);
    return () => window.removeEventListener("social:set-feed-scope", onSetScope as EventListener);
  }, []);

  const friendIdSet = useMemo(() => {
    return new Set<number>((friends ?? []).map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id)));
  }, [friends]);

  const allPosts = posts ?? [];

  const globalPostsCount = useMemo(() => allPosts.filter((post: any) => post.visibility === "public").length, [allPosts]);
  const friendsPostsCount = useMemo(() => allPosts.filter((post: any) => {
    const authorId = Number(post?.author?.id ?? 0);
    if (!Number.isFinite(authorId) || authorId <= 0) return false;
    return authorId === user?.id || friendIdSet.has(authorId);
  }).length, [allPosts, friendIdSet, user?.id]);
  const myPostsCount = useMemo(() => allPosts.filter((post: any) => Number(post?.author?.id ?? 0) === user?.id).length, [allPosts, user?.id]);
  const myPosts = useMemo(() => {
    return allPosts
      .filter((post: any) => Number(post?.author?.id ?? 0) === user?.id)
      .sort((a: any, b: any) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [allPosts, user?.id]);
  const myPhotoPosts = useMemo(() => myPosts.filter((post: any) => Boolean(post?.imageUrl)).slice(0, 6), [myPosts]);
  const myTotalLikes = useMemo(() => myPosts.reduce((sum: number, post: any) => sum + Number(post?.likeCount ?? 0), 0), [myPosts]);
  const myTotalComments = useMemo(() => myPosts.reduce((sum: number, post: any) => sum + Number(post?.commentCount ?? 0), 0), [myPosts]);

  const scopedPosts = useMemo(() => {
    if (!user) return [];

    if (scope === "global") {
      return allPosts.filter((post: any) => post.visibility === "public");
    }

    if (scope === "friends") {
      return allPosts.filter((post: any) => {
        const authorId = Number(post?.author?.id ?? 0);
        if (!Number.isFinite(authorId) || authorId <= 0) return false;
        return authorId === user.id || friendIdSet.has(authorId);
      });
    }

    return allPosts.filter((post: any) => post.visibility === "public");
  }, [allPosts, friendIdSet, scope, user]);

  const onlineUsers = useMemo(() => {
    const seen = new Set<number>();
    const rows: Array<{ id: number; name: string | null; avatarUrl: string | null }> = [];

    for (const conversation of conversations ?? []) {
      if (!conversation?.isOnline) continue;
      const friendId = Number(conversation?.friend?.id ?? 0);
      if (!Number.isFinite(friendId) || friendId <= 0 || seen.has(friendId)) continue;
      seen.add(friendId);
      rows.push({
        id: friendId,
        name: conversation?.friend?.name ?? "Jogador",
        avatarUrl: conversation?.friend?.avatarUrl ?? null,
      });
    }

    return rows;
  }, [conversations]);

  const kkTotal = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.kk?.hands ?? 0), 0);
  const jjTotal = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.jj?.hands ?? 0), 0);
  const aaTotal = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.aa?.hands ?? 0), 0);
  const akTotal = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.ak?.hands ?? 0), 0);
  const kkWins = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.kk?.wins ?? 0), 0);
  const kkLosses = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.kk?.losses ?? 0), 0);
  const jjWins = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.jj?.wins ?? 0), 0);
  const jjLosses = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.jj?.losses ?? 0), 0);
  const aaWins = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.aa?.wins ?? 0), 0);
  const aaLosses = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.aa?.losses ?? 0), 0);
  const akWins = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.ak?.wins ?? 0), 0);
  const akLosses = (globalHandPatternStats ?? []).reduce((sum: number, player: any) => sum + (player.ak?.losses ?? 0), 0);
  const kkWinRate = kkTotal > 0 ? Math.round((kkWins / kkTotal) * 100) : 0;
  const jjWinRate = jjTotal > 0 ? Math.round((jjWins / jjTotal) * 100) : 0;
  const aaWinRate = aaTotal > 0 ? Math.round((aaWins / aaTotal) * 100) : 0;
  const akWinRate = akTotal > 0 ? Math.round((akWins / akTotal) * 100) : 0;

  if (!user) return null;

  return (
    <div className="social-page min-h-full space-y-4 pb-20 text-white">
      <div className="relative mx-auto w-full max-w-[1040px] px-2 sm:px-3 xl:px-0">
        <main className="w-full space-y-4 xl:max-w-[630px] xl:-ml-5">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Button
              type="button"
              size="sm"
              variant={scope === "global" ? "default" : "ghost"}
              className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs"
              onClick={() => setScope("global")}
            >
              Global
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "friends" ? "default" : "ghost"}
              className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs"
              onClick={() => setScope("friends")}
            >
              Amigos
            </Button>
          </div>

          <NewPostForm currentUserId={user.id} />

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="social-post space-y-3 p-4 md:p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              ))}
            </div>
          ) : scopedPosts.length > 0 ? (
            <div className="space-y-4">
              {scopedPosts.map((post: any) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={user.id}
                  onOpenProfile={(author) => setLocation(buildProfilePath({ id: author.id, name: author.name }))}
                />
              ))}
            </div>
          ) : (
            <div className="social-post py-16 text-center text-muted-foreground">
              <Globe className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p className="font-medium">Nenhum post nesse filtro</p>
              <p className="mt-1 text-sm">
                {scope === "friends"
                  ? "Sem posts de amizades por enquanto."
                  : "Ainda nao ha posts publicos visiveis."}
              </p>
            </div>
          )}
        </main>

        <aside className="hidden w-[320px] space-y-4 xl:fixed xl:right-20 xl:top-20 xl:block">
          <div className="social-shell p-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Sugestões</p>
              <div className="space-y-2">
                {(friends ?? []).slice(0, 3).map((friend: any) => (
                  <button
                    key={`suggestion-${friend.id}`}
                    type="button"
                    className="social-muted-panel flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.06]"
                    onClick={() => setLocation(buildProfilePath({ id: Number(friend.id), name: friend.name }))}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.avatarUrl ?? undefined} />
                      <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{friend.name ?? "Jogador"}</p>
                      <p className="text-xs text-muted-foreground">Sugestão para você</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">Ver</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="social-shell p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-emerald-400" />
              Online no aplicativo
            </div>
            {onlineUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem jogadores online agora.</p>
            ) : (
              <div className="space-y-2">
                {onlineUsers.slice(0, 6).map((online) => (
                  <button
                    key={`feed-online-${online.id}`}
                    type="button"
                    className="social-muted-panel flex w-full items-center gap-2 p-2 text-left"
                    onClick={() => setLocation(buildProfilePath({ id: online.id, name: online.name }))}
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={online.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(online.name)}</AvatarFallback>
                      </Avatar>
                      <OnlinePresenceDot className="absolute -bottom-1 -right-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{online.name ?? "Jogador"}</p>
                      <OnlinePresenceLabel text="online" className="px-2 py-0.5 text-[10px]" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="social-shell p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4 text-primary" />
              Destaques da mesa
            </div>
            {loadingGlobalHandStats ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">KK</p>
                    <p className="text-xs text-muted-foreground">Vitorias {kkWins} - Derrotas {kkLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{kkWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">JJ</p>
                    <p className="text-xs text-muted-foreground">Vitorias {jjWins} - Derrotas {jjLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{jjWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">AA</p>
                    <p className="text-xs text-muted-foreground">Vitorias {aaWins} - Derrotas {aaLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{aaWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">AK</p>
                    <p className="text-xs text-muted-foreground">Vitorias {akWins} - Derrotas {akLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{akWinRate}%</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        <Button
          type="button"
          className="fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(109,40,217,0.45)] transition-transform hover:scale-[1.04]"
          onClick={() => setLocation("/chat")}
          aria-label="Abrir mensagens"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}







