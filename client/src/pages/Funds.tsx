import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useBehaviorProfile } from "@/hooks/useBehaviorProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  Laptop,
  Building2,
} from "lucide-react";

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function Funds() {
  const { primaryType, playTypeOrder } = useBehaviorProfile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<"deposit" | "withdrawal">("deposit");
  const [bankrollType, setBankrollType] = useState<"online" | "live">(primaryType);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [filterType, setFilterType] = useState<"all" | "online" | "live">(primaryType);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const utils = trpc.useUtils();

  const { data: transactions, isLoading: loadingTransactions } =
    trpc.funds.list.useQuery(
      filterType === "all" ? {} : { bankrollType: filterType }
    );

  const { data: totals, isLoading: loadingTotals } =
    trpc.funds.totals.useQuery();

  const { data: bankroll, isLoading: loadingBankroll } =
    trpc.bankroll.getCurrent.useQuery();

  const { data: exchangeRate } = trpc.currency.getRate.useQuery();

  const createMutation = trpc.funds.create.useMutation({
    onSuccess: () => {
      toast.success(
        transactionType === "deposit"
          ? "Depósito registrado com sucesso!"
          : "Saque registrado com sucesso!"
      );
      utils.funds.list.invalidate();
      utils.funds.totals.invalidate();
      utils.bankroll.getCurrent.invalidate();
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Erro ao registrar: ${error.message}`);
    },
  });

  const deleteMutation = trpc.funds.delete.useMutation({
    onSuccess: () => {
      toast.success("Transação excluída com sucesso!");
      utils.funds.list.invalidate();
      utils.funds.totals.invalidate();
      utils.bankroll.getCurrent.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  useEffect(() => {
    if (defaultsApplied) return;
    setBankrollType(primaryType);
    setFilterType(primaryType);
    setDefaultsApplied(true);
  }, [defaultsApplied, primaryType]);

  const resetForm = () => {
    setTransactionType("deposit");
    setBankrollType(primaryType);
    setAmount("");
    setCurrency("BRL");
    setDescription("");
    setTransactionDate(new Date().toISOString().split("T")[0]);
  };

  const summaryCards = useMemo(() => {
    const primaryCards = playTypeOrder.map((type) => ({
      key: type,
      title: type === "online" ? "Bankroll Online" : "Bankroll Live",
      icon: type === "online" ? Laptop : Building2,
      accent: type === "online" ? "border-l-chart-4" : "border-l-primary",
      data: bankroll?.[type],
    }));

    return [
      ...primaryCards,
      {
        key: "total" as const,
        title: "Bankroll Total",
        icon: DollarSign,
        accent: "border-l-chart-2",
        data: bankroll?.total,
      },
    ];
  }, [bankroll, playTypeOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    createMutation.mutate({
      transactionType,
      bankrollType,
      amount: Math.round(amountNum * 100), // Convert to centavos
      currency,
      description: description || undefined,
      transactionDate: new Date(transactionDate),
    });
  };

  const isLoading = loadingTransactions || loadingTotals || loadingBankroll;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Caixa
          </h1>
          <p className="text-muted-foreground">
            Adicione depósitos ou saques ao seu bankroll
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Nova Transação
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-popover border-border">
            <DialogHeader>
              <DialogTitle>Nova Transação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Transaction Type */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={transactionType === "deposit" ? "default" : "outline"}
                  className={
                    transactionType === "deposit"
                      ? "bg-primary hover:bg-primary/90"
                      : ""
                  }
                  onClick={() => setTransactionType("deposit")}
                >
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Depósito
                </Button>
                <Button
                  type="button"
                  variant={transactionType === "withdrawal" ? "default" : "outline"}
                  className={
                    transactionType === "withdrawal"
                      ? "bg-destructive hover:bg-destructive/90"
                      : ""
                  }
                  onClick={() => setTransactionType("withdrawal")}
                >
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Saque
                </Button>
              </div>

              {/* Bankroll Type */}
              <div className="space-y-2">
                <Label>Bankroll</Label>
                <div className="grid grid-cols-2 gap-2">
                  {playTypeOrder.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={bankrollType === type ? "default" : "outline"}
                      className={
                        bankrollType === type
                          ? type === "online"
                            ? "bg-chart-4 hover:bg-chart-4/90 text-white"
                            : "bg-primary hover:bg-primary/90"
                          : ""
                      }
                      onClick={() => setBankrollType(type)}
                    >
                      {type === "online" ? <Laptop className="h-4 w-4 mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                      {type === "online" ? "Online" : "Live"}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Amount and Currency */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-2">
                  <Label>Valor</Label>
                  <Input
                    type="text"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Moeda</Label>
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as "BRL" | "USD")}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">R$</SelectItem>
                      <SelectItem value="USD">US$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {currency === "USD" && exchangeRate && (
                <p className="text-xs text-muted-foreground">
                  Cotação atual: 1 USD = {formatCurrency(exchangeRate.rate * 100)}
                </p>
              )}

              {/* Date */}
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="bg-[oklch(0.14_0.01_150)] border-[oklch(0.28_0.03_150)]"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input
                  type="text"
                  placeholder="Ex: Bônus de depósito, Saque para conta bancária..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-[oklch(0.14_0.01_150)] border-[oklch(0.28_0.03_150)]"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Salvando..." : "Salvar Transação"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          if (card.key === "total") {
            return (
              <Card key={card.key} className={`border-l-4 ${card.accent}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {card.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(bankroll?.total.current || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span>Total depósitos:</span>
                      <span className="text-chart-1">
                        +{formatCurrency(totals?.total.deposits || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total saques:</span>
                      <span className="text-destructive">
                        -{formatCurrency(totals?.total.withdrawals || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={card.key} className={`border-l-4 ${card.accent}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(card.data?.current || 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-1">
                  <div className="flex justify-between">
                    <span>Inicial:</span>
                    <span>{formatCurrency(card.data?.initial || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lucro sessões:</span>
                    <span className={card.data?.profit && card.data.profit >= 0 ? "text-chart-1" : "text-destructive"}>
                      {formatCurrency(card.data?.profit || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Depósitos/Saques:</span>
                    <span className={card.data?.fundNet && card.data.fundNet >= 0 ? "text-chart-1" : "text-destructive"}>
                      {formatCurrency(card.data?.fundNet || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Histórico de Transações
            </CardTitle>
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as typeof filterType)}
            >
              <SelectTrigger className="w-[150px] bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {playTypeOrder.map((type) => (
                  <SelectItem key={type} value={type}>{type === "online" ? "Online" : "Live"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!transactions || transactions.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhuma transação registrada
              </h3>
              <p className="text-muted-foreground mb-4">
                Adicione depósitos ou saques para gerenciar seu bankroll
              </p>
              <Button
                onClick={() => setIsDialogOpen(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Transação
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        transaction.transactionType === "deposit"
                          ? "bg-primary/20 text-chart-1"
                          : "bg-destructive/20 text-destructive"
                      }`}
                    >
                      {transaction.transactionType === "deposit" ? (
                        <ArrowUpCircle className="h-5 w-5" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {transaction.transactionType === "deposit"
                          ? "Depósito"
                          : "Saque"}
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            transaction.bankrollType === "online"
                              ? "bg-chart-4/20 text-chart-4"
                              : "bg-primary/20 text-chart-1"
                          }`}
                        >
                          {transaction.bankrollType === "online"
                            ? "Online"
                            : "Live"}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(transaction.transactionDate)}
                        {transaction.description && ` • ${transaction.description}`}
                      </div>
                      {transaction.currency === "USD" && transaction.originalAmount && (
                        <div className="text-xs text-muted-foreground">
                          Original: US$ {(transaction.originalAmount / 100).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-lg font-bold ${
                        transaction.transactionType === "deposit"
                          ? "text-chart-1"
                          : "text-destructive"
                      }`}
                    >
                      {transaction.transactionType === "deposit" ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta transação?")) {
                          deleteMutation.mutate({ id: transaction.id });
                        }
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
