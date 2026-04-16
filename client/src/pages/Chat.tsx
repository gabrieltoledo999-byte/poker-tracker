import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import SocialHubNav from "@/components/SocialHubNav";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Image, Send, MessageCircle, X, Radio, Sparkles } from "lucide-react";
import { toast } from "sonner";

const MESSAGE_REACTIONS = ["❤️", "🔥", "😂", "👏", "👀"] as const;

function getAvatarSrc(params: {
  id?: number | null;
  name?: string | null;
  avatarUrl?: string | null;
}): string | undefined {
  if (params.avatarUrl?.trim()) return params.avatarUrl.trim();
  const seed = encodeURIComponent(params.name?.trim() || String(params.id ?? "user"));
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Conversation view ────────────────────────────────────────────────────────
function ConversationView({
  friendId,
  friendName,
  friendAvatarUrl,
  onBack,
}: {
  friendId: number;
  friendName: string | null;
  friendAvatarUrl: string | null;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [openReactionMessageId, setOpenReactionMessageId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: msgs = [], isLoading } = trpc.chat.messages.useQuery(
    { friendId },
    { refetchInterval: 5000, staleTime: 3000, refetchOnWindowFocus: true }
  );

  const markReadMutation = trpc.chat.markRead.useMutation();
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: async () => {
      await utils.chat.messages.invalidate({ friendId });
      await utils.chat.conversations.invalidate();
      await utils.chat.unreadCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadImageMutation = trpc.upload.postImage.useMutation({
    onError: (e) => toast.error("Erro ao enviar imagem: " + e.message),
  });
  const reactMutation = trpc.chat.react.useMutation({
    onSuccess: async () => {
      await utils.chat.messages.invalidate({ friendId });
      await utils.chat.conversations.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Mark messages read when entering conversation
  useEffect(() => {
    const currentConversations = utils.chat.conversations.getData() ?? [];
    const currentConversation = currentConversations.find((item) => item.friend.id === friendId);
    const unreadToClear = currentConversation?.unreadCount ?? 0;

    if (unreadToClear > 0) {
      utils.chat.conversations.setData(undefined, currentConversations.map((item) => (
        item.friend.id === friendId
          ? { ...item, unreadCount: 0 }
          : item
      )));

      const unreadSnapshot = utils.chat.unreadCount.getData();
      if (unreadSnapshot) {
        utils.chat.unreadCount.setData(undefined, {
          count: Math.max(0, unreadSnapshot.count - unreadToClear),
        });
      }
    }

    markReadMutation.mutate(
      { friendId },
      {
        onSuccess: async () => {
          await utils.chat.conversations.invalidate();
          await utils.chat.unreadCount.invalidate();
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const clearPendingImage = () => {
    setPendingImageFile(null);
    setPendingImagePreview(null);
  };

  const handleSend = async () => {
    const trimmedText = text.trim();

    if (!pendingImageFile) {
      if (!trimmedText) return;
      setText("");
      sendMutation.mutate({ receiverId: friendId, content: trimmedText, type: "text" });
      return;
    }

    if (!trimmedText) {
      toast.error("Escreva uma mensagem antes de enviar a foto.");
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pendingImageFile);
      });
      const { url } = await uploadImageMutation.mutateAsync({ base64, mimeType: pendingImageFile.type });
      await sendMutation.mutateAsync({
        receiverId: friendId,
        content: url,
        caption: trimmedText,
        type: "image",
      });
      setText("");
      clearPendingImage();
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Somente imagens são permitidas.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8 MB).");
      return;
    }
    const preview = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPendingImageFile(file);
    setPendingImagePreview(preview);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="social-shell flex h-[calc(100dvh-11rem)] min-h-[36rem] flex-col p-4 md:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 border-b border-border/60 pb-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="lg:hidden">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9">
          <AvatarImage src={getAvatarSrc({ id: friendId, name: friendName, avatarUrl: friendAvatarUrl })} />
          <AvatarFallback>{getInitials(friendName)}</AvatarFallback>
        </Avatar>
        <p className="font-semibold">{friendName ?? "Jogador"}</p>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
          <Radio className="h-3 w-3" /> Online agora
        </span>
      </div>

      {/* Messages */}
      <div className="app-scrollbar flex-1 space-y-2 overflow-y-auto rounded-[1.5rem] bg-background/55 px-2 pb-2 pr-2 pt-1 md:px-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={`h-10 w-2/3 ${i % 2 === 0 ? "ml-auto" : ""}`} />
            ))}
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageCircle className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma mensagem ainda. Diga oi!</p>
          </div>
        ) : (
          msgs.map((msg) => {
            const isMine = msg.senderId === user?.id;
            const myReaction = msg.myReaction ?? null;
            const myReactionCount = myReaction
              ? (msg.reactionSummary?.find((item: { emoji: string; count: number }) => item.emoji === myReaction)?.count ?? 0)
              : 0;
            const pickerOpen = openReactionMessageId === msg.id;

            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  }`}
                >
                  {msg.type === "image" ? (
                    <div className="space-y-2">
                      <img
                        src={msg.content}
                        alt="imagem"
                        className="rounded-lg max-w-[240px] max-h-[240px] object-cover cursor-pointer"
                        onClick={() => window.open(msg.content, "_blank")}
                      />
                      {msg.caption ? (
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.caption}</p>
                      ) : null}
                      <div className="relative pt-1">
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                            myReaction
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setOpenReactionMessageId((current) => (current === msg.id ? null : msg.id))}
                          disabled={reactMutation.isPending}
                        >
                          {myReaction ? (
                            <>
                              <span>{myReaction}</span>
                              {myReactionCount > 0 ? <span>{myReactionCount}</span> : null}
                            </>
                          ) : (
                            <span>Reagir</span>
                          )}
                        </button>

                        {pickerOpen ? (
                          <div className="absolute bottom-full left-0 z-10 mb-2 flex items-center gap-1 rounded-full border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur">
                            {MESSAGE_REACTIONS.map((emoji) => {
                              const active = myReaction === emoji;
                              return (
                                <button
                                  key={`${msg.id}-${emoji}`}
                                  type="button"
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                                    active
                                      ? "bg-primary/20"
                                      : "hover:bg-muted"
                                  }`}
                                  onClick={() => {
                                    reactMutation.mutate({ messageId: msg.id, emoji });
                                    setOpenReactionMessageId(null);
                                  }}
                                  disabled={reactMutation.isPending}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  )}
                  <p className={`text-[10px] mt-0.5 ${isMine ? "text-primary-foreground/60 text-right" : "text-muted-foreground"}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 space-y-2 border-t border-border/60 pt-4">
        {pendingImagePreview ? (
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/35 p-3">
            <img
              src={pendingImagePreview}
              alt="Foto anexada"
              className="h-20 w-20 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Foto anexada</p>
              <p className="text-xs text-muted-foreground">Escreva a mensagem abaixo e clique em enviar para confirmar.</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={clearPendingImage}
              disabled={uploading || sendMutation.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sendMutation.isPending}
            title="Enviar foto"
          >
            <Image className="h-4 w-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImageFile ? "Escreva a mensagem da foto..." : "Digite uma mensagem..."}
            disabled={sendMutation.isPending || uploading}
            className="h-12 flex-1 rounded-full border-border/60 bg-background/70 px-5"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sendMutation.isPending || uploading}
            className="h-12 w-12 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation list ────────────────────────────────────────────────────────
export default function Chat() {
  const [, setLocation] = useLocation();
  const [selectedFriend, setSelectedFriend] = useState<{
    id: number;
    name: string | null;
    avatarUrl: string | null;
  } | null>(null);

  const { data: friends = [], isLoading: loadingFriends } = trpc.ranking.friends.useQuery(undefined, {
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: conversations = [], isLoading: loadingConversations } = trpc.chat.conversations.useQuery(undefined, {
    refetchInterval: 15000,
    staleTime: 8000,
    refetchOnWindowFocus: true,
  });

  const { data: unreadData } = trpc.chat.unreadCount.useQuery(undefined, {
    refetchInterval: 15000,
    staleTime: 8000,
    refetchOnWindowFocus: true,
  });

  // Build a map: friendId -> conversation data
  const convMap = new Map(conversations.map((c) => [c.friend.id, c]));

  useEffect(() => {
    if (selectedFriend || typeof window === "undefined" || window.innerWidth < 1024) return;

    const firstConversation = conversations[0]?.friend;
    const firstFriend = firstConversation ?? friends[0];
    if (firstFriend) {
      setSelectedFriend({
        id: firstFriend.id,
        name: firstFriend.name,
        avatarUrl: firstFriend.avatarUrl,
      });
    }
  }, [conversations, friends, selectedFriend]);

  if (selectedFriend && typeof window !== "undefined" && window.innerWidth < 1024) {
    return (
      <div className="social-page space-y-4">
        <SocialHubNav />
        <ConversationView
          friendId={selectedFriend.id}
          friendName={selectedFriend.name}
          friendAvatarUrl={selectedFriend.avatarUrl}
          onBack={() => setSelectedFriend(null)}
        />
      </div>
    );
  }

  return (
    <div className="social-page flex flex-col space-y-4">
      <SocialHubNav />

      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-6 w-6 text-primary" />
            Mensagens
          </h1>

        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm font-medium shadow-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          {!!unreadData?.count ? `${unreadData.count} novas agora` : "Tudo em dia"}
        </div>
      </div>

      {loadingFriends || loadingConversations ? (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="social-shell space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-18 w-full rounded-2xl" />)}
          </div>
          <div className="social-shell p-4">
            <Skeleton className="h-[calc(100dvh-12rem)] w-full rounded-[1.5rem]" />
          </div>
        </div>
      ) : friends.length === 0 ? (
        <div className="social-shell flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <MessageCircle className="h-12 w-12 opacity-30" />
          <p className="font-medium">Nenhuma conversa ainda</p>
          <p className="text-sm">Adicione amigos na área de Pessoas para começar a conversar.</p>
          <Button variant="outline" onClick={() => setLocation("/invites")}>
            Ir para Pessoas
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="social-shell p-3 md:p-4">
            <div className="mb-3 px-1">
              <p className="text-sm font-semibold">Conversas recentes</p>
              <p className="text-xs text-muted-foreground">As mensagens mais quentes da sua rede ficam aqui.</p>
            </div>

            <div className="app-scrollbar max-h-[calc(100dvh-14rem)] space-y-2 overflow-y-auto pr-1">
              {friends.map((friend) => {
                const conv = convMap.get(friend.id);
                const unread = conv?.unreadCount ?? 0;
                const lastMsg = conv?.lastMessage;
                const isActive = selectedFriend?.id === friend.id;

                return (
                  <button
                    key={friend.id}
                    type="button"
                    className={`w-full rounded-[1.35rem] border p-3 text-left transition-all ${
                      isActive
                        ? "border-primary/30 bg-primary/10 shadow-sm"
                        : "border-border/60 bg-background/45 hover:bg-muted/45"
                    }`}
                    onClick={() => setSelectedFriend({ id: friend.id, name: friend.name, avatarUrl: friend.avatarUrl })}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <Avatar className="h-12 w-12 ring-2 ring-background">
                          <AvatarImage src={getAvatarSrc({ id: friend.id, name: friend.name, avatarUrl: friend.avatarUrl })} />
                          <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                        </Avatar>
                        {unread > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-sm ${unread > 0 ? "font-semibold" : "font-medium"}`}>
                            {friend.name ?? "Jogador"}
                          </p>
                          {lastMsg ? (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatTime(lastMsg.createdAt)}</span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {lastMsg
                            ? (lastMsg.type === "image" ? `📷 ${lastMsg.caption?.trim() || "Foto enviada"}` : lastMsg.content)
                            : "Comece essa conversa agora"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedFriend ? (
            <ConversationView
              friendId={selectedFriend.id}
              friendName={selectedFriend.name}
              friendAvatarUrl={selectedFriend.avatarUrl}
              onBack={() => setSelectedFriend(null)}
            />
          ) : (
            <div className="social-shell hidden items-center justify-center p-6 text-center text-muted-foreground lg:flex">
              <div className="max-w-sm space-y-3">
                <MessageCircle className="mx-auto h-14 w-14 opacity-35" />
                <p className="text-lg font-semibold text-foreground">Escolha uma conversa</p>
                <p className="text-sm">No desktop, suas conversas ficam como um inbox social. Toque em alguém para abrir o papo.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
