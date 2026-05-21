"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

interface DadosTela {
  nomeSala: string;
  status: "🟢 DISPONÍVEL" | "🔴 OCUPADA" | "🟡 RESERVADA";
  clienteAtual: string;
  horarioUso: string;
}

export default function TabletPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  
  const [dados, setDados] = useState<DadosTela>({
    nomeSala: "Carregando...",
    status: "🟢 DISPONÍVEL",
    clienteAtual: "Ninguém na sala",
    horarioUso: "--:-- às --:--",
  });

  useEffect(() => {
    async function carregarDadosDaSala() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }

      // Pega "001" do e-mail "sala001@sistema.com"
      const numeroSala = user.email?.match(/\d+/)?.[0] || "001";

      try {
        // 1. Busca a sala (tudo minúsculo, igual criamos no SQL)
        const { data: salaBD, error: erroSala } = await supabase
          .from("salas")
          .select("nome")
          .eq("numero", numeroSala)
          .single();

        if (erroSala) throw erroSala;

        // 2. Busca a reserva
        const { data: reservaBD, error: erroReserva } = await supabase
          .from("reservas")
          .select("cliente, inicio, fim")
          .eq("sala_numero", numeroSala)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (erroReserva) throw erroReserva;

        // 3. Monta a tela
        if (reservaBD) {
          const horaInicio = reservaBD.inicio.substring(0, 5);
          const horaFim = reservaBD.fim.substring(0, 5);

          setDados({
            nomeSala: salaBD.nome,
            status: "🔴 OCUPADA",
            clienteAtual: reservaBD.cliente,
            horarioUso: `das ${horaInicio}h - ${horaFim}h`,
          });
        } else {
          setDados({
            nomeSala: salaBD.nome,
            status: "🟢 DISPONÍVEL",
            clienteAtual: "Livre para Uso",
            horarioUso: "Sem agendamentos no momento",
          });
        }
      } catch (err: any) {
        console.error(err);
        setErro("Falha ao carregar dados do banco.");
      } finally {
        setLoading(false);
      }
    }

    carregarDadosDaSala();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-2xl animate-pulse">Sincronizando dados com a sala...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-slate-950 p-12 text-white relative">
      
      {/* Botão de Logout (Pequeno e no canto para não atrapalhar o visual) */}
      <button 
        onClick={handleLogout}
        className="absolute top-4 right-4 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white px-4 py-2 rounded text-sm transition-all"
      >
        Sair
      </button>

      <div className="w-full text-center text-sm text-gray-600 tracking-widest uppercase">
        Espaço do Banner Superior
      </div>

      <div className="text-center flex flex-col gap-6 my-auto">
        <h1 className="text-8xl font-black tracking-tight text-slate-100 uppercase">
          {dados.nomeSala}
        </h1>
        <div className="text-3xl font-bold tracking-wide mt-2">
          {dados.status}
        </div>
        <p className="text-4xl font-medium text-blue-400 mt-4">
          {dados.clienteAtual}
        </p>
        <p className="text-2xl font-light text-slate-400">
          {dados.horarioUso}
        </p>
      </div>

      <div className="w-full text-center text-sm text-gray-600 tracking-widest uppercase">
        Espaço do Banner Inferior
      </div>
      
      {/* Exibe erro se algo der errado */}
      {erro && <p className="absolute bottom-4 text-red-500">{erro}</p>}
    </div>
  );
}