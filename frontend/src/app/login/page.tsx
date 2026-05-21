"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Guardamos o erro real e uma nova mensagem de sucesso
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Aqui nós pegamos o erro VERDADEIRO do Supabase e jogamos na tela
      setError("Motivo da falha: " + error.message);
      setLoading(false);
    } else {
      // Se deu certo, mostramos a mensagem verde e esperamos 2 segundos para trocar de tela
      setSuccess(true);
      setTimeout(() => {
        router.push("/tablet"); 
      }, 2000);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md rounded-lg bg-slate-800 p-8 shadow-2xl">
        
        <h1 className="mb-6 text-center text-3xl font-bold text-blue-500">
          Acesso da Sala
        </h1>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          
          <div>
            <label className="mb-1 block text-sm text-gray-400">Usuário (E-mail)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded bg-slate-700 p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="sala001@sistema.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded bg-slate-700 p-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {/* O erro agora é amarelo para chamar bastante atenção */}
          {error && (
            <div className="rounded bg-yellow-600/20 p-3 border border-yellow-500">
              <p className="text-sm font-bold text-yellow-500">{error}</p>
            </div>
          )}

          {/* Se der certo, essa caixa verde gigante aparece */}
          {success && (
            <div className="rounded bg-green-600/20 p-3 border border-green-500 text-center">
              <p className="text-sm font-bold text-green-500">🎉 Login com sucesso! Redirecionando...</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || success}
            className="mt-4 w-full rounded bg-blue-600 p-3 font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Conectando..." : "Entrar no Tablet"}
          </button>

        </form>
      </div>
    </div>
  );
}