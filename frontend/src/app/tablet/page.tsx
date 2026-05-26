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

      const numeroSala = user.email?.match(/\d+/)?.[0] || "001";

      try {
        // 1. Agora nós buscamos o STATUS da sala também, pois o Cron está atualizando ele!
        const { data: salaBD, error: erroSala } = await supabase
          .from("salas")
          .select("nome, status")
          .eq("numero", numeroSala)
          .single();

        if (erroSala) throw erroSala;

        const hoje = new Date().toLocaleDateString("pt-BR").split("/").reverse().join("-");

        // 2. Busca a reserva do dia para pegar o nome do cliente
        const { data: reservaBD, error: erroReserva } = await supabase
          .from("reservas")
          .select("cliente, inicio, fim")
          .eq("sala_numero", numeroSala)
          .eq("data", hoje)
          .order("inicio", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (erroReserva) throw erroReserva;

        // 3. A regra de negócio agora confia cegamente no status que o Banco de Dados definiu
        if (salaBD.status === 'OCUPADA' && reservaBD) {
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
            // Mostra a próxima reserva, se houver, ou a mensagem vazia
            horarioUso: reservaBD ? `Próxima reserva hoje: ${reservaBD.inicio.substring(0, 5)}h` : "Sem agendamentos para hoje",
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

    // --- NOVA SINCRONIZAÇÃO DUPLA ---
    const canalRealtime = supabase
      .channel('room-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'salas' }, // Escuta o relógio (Cron)
        (payload) => {
          console.log("O tempo bateu! Status da sala atualizado no banco.", payload);
          carregarDadosDaSala(); 
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservas' }, // Escuta novos cadastros manuais
        (payload) => {
          console.log("Nova reserva cadastrada ou alterada.", payload);
          carregarDadosDaSala(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalRealtime);
    };
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
      
      {erro && <p className="absolute bottom-4 text-red-500">{erro}</p>}
    </div>
  );
}