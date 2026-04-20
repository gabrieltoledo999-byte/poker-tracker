import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Bot, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ParserSelection } from "@/parser/handHistoryDispatcher";

interface HandHistoryInputProps {
  value: string;
  onChange: (value: string) => void;
  selectedPlatform: ParserSelection;
  onPlatformChange: (platform: ParserSelection) => void;
  onSubmit: () => void;
  compact: boolean;
  onRequestExpand: () => void;
}

export function HandHistoryInput(props: HandHistoryInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const detectedHands = (props.value.match(/(?:PokerStars|GGPoker|Natural8|Poker) Hand #/g) ?? []).length;
  const detectedTournamentId = props.value.match(/Tournament #?(\d+)/i)?.[1] ?? null;

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    props.onChange(text);
    event.target.value = "";
  };

  const readDroppedFile = async (file: File) => {
    const text = await file.text();
    props.onChange(text);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await readDroppedFile(file);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card p-3 text-foreground shadow-xl dark:border-white/10 dark:bg-[linear-gradient(160deg,rgba(8,12,22,0.96),rgba(10,18,34,0.92))] dark:text-white md:p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-xl bg-cyan-400/15 p-2 text-cyan-200">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/90">Entrada inteligente</p>
          <p className="text-[11px] text-muted-foreground dark:text-zinc-300">Cole hand history, descrição, ou arraste um arquivo.</p>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed transition-colors ${isDragging ? "border-cyan-400 bg-cyan-400/10" : "border-transparent"}`}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/95 dark:bg-slate-950/80">
            <FileText className="h-8 w-8 text-cyan-600 dark:text-cyan-300" />
            <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-200">Solte o arquivo aqui</p>
          </div>
        )}
        <Textarea
          value={props.value}
          onChange={event => props.onChange(event.target.value)}
          className="h-24 resize-none overflow-y-auto border-input bg-background font-mono text-[11px] leading-5 text-foreground placeholder:text-muted-foreground dark:border-white/20 dark:bg-slate-950/45 dark:text-zinc-100 dark:placeholder:text-zinc-400"
          placeholder="Cole aqui sua hand history ou arraste um arquivo .txt / .log"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-100/90">Plataforma do torneio:</span>
        {([
          { value: "AUTO", label: "Auto" },
          { value: "POKERSTARS", label: "PokerStars" },
          { value: "GG", label: "GG" },
        ] as Array<{ value: ParserSelection; label: string }>).map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onPlatformChange(option.value)}
            className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition ${props.selectedPlatform === option.value ? "border-cyan-300/70 bg-cyan-500/15 text-cyan-800 dark:bg-cyan-400/20 dark:text-cyan-100" : "border-border/70 bg-background text-muted-foreground hover:bg-accent dark:border-white/20 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {props.value.trim().length > 0 && (
        <div className="mt-2 rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-800 dark:border-cyan-300/25 dark:bg-cyan-400/8 dark:text-cyan-100/90">
          Transcript carregado{detectedTournamentId ? ` • Torneio #${detectedTournamentId}` : ""}
          {detectedHands > 0 ? ` • ${detectedHands} mãos detectadas` : ""}
          {` • Plataforma: ${props.selectedPlatform}`}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.log,.hh,.text"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="border-border/70 bg-background text-foreground hover:bg-accent dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" onClick={handleOpenFile}>
          <Upload className="mr-2 h-4 w-4" />
          Importar arquivo
        </Button>
        <Button size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300" onClick={props.onSubmit}>
          Enviar para mesa
        </Button>
      </div>
    </section>
  );
}
