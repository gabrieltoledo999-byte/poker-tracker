import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <div className="flex-1 min-w-0 bg-muted/40 rounded-lg px-3 py-2">
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

function PostCard({ post, currentUserId }: { post: any; currentUserId: number }) {
  const [showComments, setShowComments] = useState(false);
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

  const deletePost = trpc.feed.delete.useMutation({
    onSuccess: () => {
      utils.feed.list.invalidate();
      toast.success("Post excluído");
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
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
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-3">
          {post.content}
        </p>

        {/* Image */}
        {post.imageUrl && (
          <div className="rounded-lg overflow-hidden mb-3 bg-muted flex items-center justify-center">
            <img
              src={post.imageUrl}
              alt="Imagem do post"
              className="w-full max-h-[480px] object-contain"
            />
          </div>
        )}

        {/* Actions */}
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

        {/* Comments */}
        {showComments && (
          <CommentSection postId={post.id} currentUserId={currentUserId} />
        )}
      </CardContent>
    </Card>
  );
}

function NewPostForm({ currentUserId }: { currentUserId: number }) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const handleSubmit = async () => {
    if (!content.trim()) return;
    let imageUrl: string | undefined;
    let imageKey: string | undefined;
    if (imageBase64) {
      const uploaded = await uploadImage.mutateAsync({
        base64: imageBase64,
        mimeType: imageMime,
      });
      imageUrl = uploaded.url;
      imageKey = uploaded.key;
    }
    createPost.mutate({ content: content.trim(), visibility, imageUrl, imageKey });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Compartilhe um resultado, uma mão interessante ou uma conquista..."
          className="min-h-[80px] resize-none"
          maxLength={1000}
        />

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
              className="gap-1.5"
            >
              <ImagePlus className="h-4 w-4" />
              Foto
            </Button>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as "public" | "friends")}
            >
              <SelectTrigger className="w-36 h-9 text-sm">
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
            disabled={!content.trim() || createPost.isPending || uploadImage.isPending}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            {createPost.isPending || uploadImage.isPending ? "Publicando..." : "Publicar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const { data: posts, isLoading } = trpc.feed.list.useQuery();

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          Feed da Comunidade
        </h1>
        <p className="text-muted-foreground">
          Compartilhe resultados, mãos e conquistas com a comunidade
        </p>
      </div>

      {/* New post */}
      <NewPostForm currentUserId={user.id} />

      {/* Posts */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post: any) => (
            <PostCard key={post.id} post={post} currentUserId={user.id} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum post ainda</p>
            <p className="text-sm mt-1">Seja o primeiro a compartilhar um resultado!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
