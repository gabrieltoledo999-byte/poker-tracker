import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SocialHubNav from "@/components/SocialHubNav";
import {
  Heart,
  MessageCircle,
  ImagePlus,
  Send,
  Trash2,
  Globe,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Flame,
} from "lucide-react";
import { toast } from "sonner";

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
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

function PostCard({ post, currentUserId }: { post: any; currentUserId: number }) {
  const [showComments, setShowComments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGestureLike, setShowGestureLike] = useState(false);
  const lastTapRef = useRef(0);
  const likeFlashTimeoutRef = useRef<number | null>(null);
  const utils = trpc.useUtils();

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

  const handleDoubleClickLike = (event: React.MouseEvent<HTMLDivElement>) => {
    if (shouldIgnoreGestureTarget(event.target)) return;
    triggerGestureLike();
  };

  const handleTouchEndLike = (event: React.TouchEvent<HTMLDivElement>) => {
    if (shouldIgnoreGestureTarget(event.target)) return;

    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta > 0 && delta < 280) {
      triggerGestureLike();
      lastTapRef.current = 0;
    }
  };

  return (
    <article className="social-post p-4 md:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.author?.avatarUrl ?? undefined} />
              <AvatarFallback className="text-sm font-semibold">
                {(post.author?.name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{post.author?.name ?? "Jogador"}</p>
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
          </div>
          {post.author?.id === currentUserId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => deletePost.mutate({ id: post.id })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Content */}
        {(post.content?.trim() || post.imageUrl) && (
          <div
            className="relative mb-3 select-none"
            onDoubleClick={handleDoubleClickLike}
            onTouchEnd={handleTouchEndLike}
          >
            {post.content?.trim() && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-3">
                {post.content}
              </p>
            )}

            {post.imageUrl && (
              <div className="rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                <img
                  src={post.imageUrl}
                  alt="Imagem do post"
                  className="w-full max-h-[480px] object-contain"
                />
              </div>
            )}

            {showGestureLike && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-black/18 p-5 backdrop-blur-[1px] animate-in zoom-in-75 fade-in duration-200">
                  <Heart className="h-16 w-16 fill-rose-500 text-rose-500 drop-shadow-[0_8px_20px_rgba(244,63,94,0.45)]" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2" data-no-double-like="true">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <button
              className={`flex items-center gap-1.5 transition-colors hover:text-rose-500 ${
                post.likedByMe ? "text-rose-500" : ""
              }`}
              onClick={() => toggleLike.mutate({ postId: post.id })}
            >
              <Heart className={`h-4 w-4 ${post.likedByMe ? "fill-rose-500" : ""}`} />
              <span>{post.likeCount}</span>
            </button>
            <button
              className={`flex items-center gap-1.5 transition-colors hover:text-yellow-500 ${showEmojiPicker ? "text-yellow-500" : ""}`}
              onClick={() => setShowEmojiPicker((v) => !v)}
              title="Reagir"
            >
              <span className="text-base leading-none">{post.myReaction ?? "🙂"}</span>
              {(post.reactionSummary?.length ?? 0) > 0 && !post.myReaction && (
                <span className="text-xs">{(post.reactionSummary as any[]).reduce((s: number, r: any) => s + r.count, 0)}</span>
              )}
            </button>
            <button
              className="flex items-center gap-1.5 transition-colors hover:text-primary"
              onClick={() => setShowComments((v) => !v)}
            >
              <MessageCircle className="h-4 w-4" />
              <span>{post.commentCount}</span>
              {showComments ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
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
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const uploadImage = trpc.upload.postImage.useMutation();
  const createPost = trpc.feed.create.useMutation({
    onSuccess: () => {
      setContent("");
      setImagePreview(null);
      setImageBase64(null);
      utils.feed.list.invalidate();
      toast.success("Post publicado!");
    },
    onError: () => toast.error("Erro ao publicar post"),
  });

  const processImageFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Somente imagens são suportadas.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    setImageMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      // Extract base64 without data URL prefix
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;

    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          return;
        }
      }
    }
  };

  const handleDropImage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && !imageBase64) return;
    let imageUrl: string | undefined;
    let imageKey: string | undefined;
    if (imageBase64) {
      try {
        const uploaded = await uploadImage.mutateAsync({
          base64: imageBase64,
          mimeType: imageMime,
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
          setImagePreview(null);
          setImageBase64(null);
          if (fileRef.current) fileRef.current.value = "";
        } else {
          toast.error(message);
          return;
        }
      }
    }
    createPost.mutate({ content: trimmedContent, visibility, imageUrl, imageKey });
  };

  return (
    <div
      className={`social-post p-4 space-y-3 transition-colors md:p-5 ${isDraggingImage ? "border-dashed border-primary/60 bg-primary/5" : ""}`}
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
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePasteImage}
          placeholder="Compartilhe um resultado, uma mão interessante ou uma conquista..."
          className="min-h-[92px] resize-none rounded-[1.5rem] border-border/60 bg-background/75 px-4 py-3"
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
              className="max-h-48 rounded-lg object-cover"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => {
                setImagePreview(null);
                setImageBase64(null);
                if (fileRef.current) fileRef.current.value = "";
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
              className="gap-1.5 rounded-full"
            >
              <ImagePlus className="h-4 w-4" />
              Foto
            </Button>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as "public" | "friends")}
            >
              <SelectTrigger className="h-10 w-36 rounded-full text-sm">
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
            disabled={(!content.trim() && !imageBase64) || createPost.isPending || uploadImage.isPending}
            className="gap-1.5 rounded-full px-5"
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
  const { data: posts, isLoading } = trpc.feed.list.useQuery();
  const { data: globalHandPatternStats, isLoading: loadingGlobalHandStats } = trpc.feed.handPatternStats.useQuery({ limit: 50, minHands: 1 });

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
    <div className="social-page space-y-4">
      <SocialHubNav />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="space-y-4">
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
          ) : posts && posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post: any) => (
                <PostCard key={post.id} post={post} currentUserId={user.id} />
              ))}
            </div>
          ) : (
            <div className="social-post py-16 text-center text-muted-foreground">
              <Globe className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p className="font-medium">Nenhum post ainda</p>
              <p className="mt-1 text-sm">Seja o primeiro a compartilhar um resultado.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="social-shell p-4 md:sticky md:top-4">
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
                    <p className="text-xs text-muted-foreground">Vitórias {kkWins} • Derrotas {kkLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{kkWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">JJ</p>
                    <p className="text-xs text-muted-foreground">Vitórias {jjWins} • Derrotas {jjLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{jjWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">AA</p>
                    <p className="text-xs text-muted-foreground">Vitórias {aaWins} • Derrotas {aaLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{aaWinRate}%</span>
                </div>
                <div className="social-muted-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">AK</p>
                    <p className="text-xs text-muted-foreground">Vitórias {akWins} • Derrotas {akLosses}</p>
                  </div>
                  <span className="text-xl font-black text-primary">{akWinRate}%</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
