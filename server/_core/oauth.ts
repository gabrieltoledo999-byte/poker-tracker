import type { Express } from "express";

/**
 * OAuth do Manus removido — o app usa autenticação própria com email/senha.
 * Este arquivo existe apenas para manter compatibilidade com o import em index.ts.
 */
export function registerOAuthRoutes(_app: Express) {
  // Nenhuma rota OAuth registrada — autenticação via /login (email + senha)
}
