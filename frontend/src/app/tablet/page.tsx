"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

interface BlocoHorario {
  horario: string;
  cliente: string;
  ocupado: boolean;
}

interface DadosTela {
  nomeSala: string;
  status: "LIVRE" | "OCUPADA";
  clienteAtual: string;
  horarioUso: string;
  blocosFuturos: BlocoHorario[];
}

export default function TabletPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Estados para o Relógio Local em Tempo Real (Apenas Visual)
  const [horaString, setHoraString] = useState("--:--");
  const [dataString, setDataString] = useState("Carregando data...");

  const [dados, setDados] = useState<DadosTela>({
    nomeSala: "Carregando...",
    status: "LIVRE",
    clienteAtual: "Buscando dados...",
    horarioUso: "--h - --h",
    blocosFuturos: [],
  });

  // 1. Efeito para manter o Relógio da tela atualizado a cada 1 segundo
  useEffect(() => {
    const atualizarRelogio = () => {
      const agora = new Date();
      
      setHoraString(agora.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }));
      
      const dataFormatada = agora.toLocaleDateString("pt-BR", { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
      setDataString(dataFormatada);
    };

    atualizarRelogio();
    const intervaloRelogio = setInterval(atualizarRelogio, 1000);
    return () => clearInterval(intervaloRelogio);
  }, []);

  // 2. Efeito para Sincronização com o Banco de Dados
  useEffect(() => {
    async function carregarDadosDaSala() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const numeroSala = user.email?.match(/\d+/)?.[0] || "001";

      try {
        const { data: salaBD, error: erroSala } = await supabase
          .from("salas")
          .select("nome, status")
          .eq("numero", numeroSala)
          .single();

        if (erroSala) throw erroSala;

        const hojeObj = new Date();
        const hoje = hojeObj.toLocaleDateString("pt-BR").split("/").reverse().join("-");
        const agora = hojeObj.toLocaleTimeString("pt-BR", { hour12: false });
        const horaAtual = hojeObj.getHours();

        // Busca todas as reservas futuras de hoje
        const { data: reservasBD, error: erroReserva } = await supabase
          .from("reservas")
          .select("cliente, inicio, fim")
          .eq("sala_numero", numeroSala)
          .eq("data", hoje)
          .gte("fim", agora)
          .order("inicio", { ascending: true });

        if (erroReserva) throw erroReserva;

        // Regra do Bloco Principal (Status Atual)
        const salaOcupada = salaBD.status === 'OCUPADA';
        let clienteAtual = "Livre para Uso";
        let horarioUso = `${horaAtual}h - ${horaAtual + 1}h`;

        if (salaOcupada && reservasBD && reservasBD.length > 0) {
          const reservaAtual = reservasBD.find(r => r.inicio <= agora && r.fim > agora) || reservasBD[0];
          clienteAtual = reservaAtual.cliente;
          horarioUso = `${reservaAtual.inicio.substring(0, 5)}h - ${reservaAtual.fim.substring(0, 5)}h`;
        }

        // Lógica de Geração Automática dos próximos 3 blocos de hora
        const blocos: BlocoHorario[] = [];
        for (let i = 1; i <= 3; i++) {
          const blockStartHour = horaAtual + i;
          
          if (blockStartHour >= 24) break; 

          const startStr = `${blockStartHour.toString().padStart(2, '0')}:00:00`;
          const endStr = `${(blockStartHour + 1).toString().padStart(2, '0')}:00:00`;

          const overlapping = reservasBD?.find(r => (r.inicio < endStr && r.fim > startStr));

          blocos.push({
            horario: `${blockStartHour}h - ${blockStartHour + 1}h`,
            cliente: overlapping ? overlapping.cliente : "Livre para reserva",
            ocupado: !!overlapping
          });
        }

        setDados({
          nomeSala: salaBD.nome,
          status: salaOcupada ? "OCUPADA" : "LIVRE",
          clienteAtual: clienteAtual,
          horarioUso: horarioUso,
          blocosFuturos: blocos,
        });

      } catch (err: any) {
        console.error(err);
        setErro("Falha ao carregar dados do banco.");
      } finally {
        setLoading(false);
      }
    }

    carregarDadosDaSala();

    // Sincronização Híbrida
    const canalRealtime = supabase
      .channel('room-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salas' }, () => carregarDadosDaSala())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, () => carregarDadosDaSala())
      .subscribe();

    const relogioLocal = setInterval(() => {
      carregarDadosDaSala();
    }, 15000); 

    return () => {
      supabase.removeChannel(canalRealtime);
      clearInterval(relogioLocal);
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-2xl animate-pulse text-slate-400">Sincronizando dados com a sala...</p>
      </div>
    );
  }

  // Remove a palavra "SALA" ou "Sala" do nome vindo do banco para isolar apenas o número
  const numeroApenas = dados.nomeSala.replace(/SALA\s*/i, "");

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white relative overflow-hidden justify-center">
      
      {/* Botão de Logout Oculto */}
      <button
        onClick={handleLogout}
        className="absolute top-4 right-4 bg-white/5 text-slate-500 hover:bg-red-600/20 hover:text-red-400 px-4 py-2 rounded text-xs transition-all z-50 opacity-0 hover:opacity-100"
      >
        Sair
      </button>

      {/* Grid Central 50/50 */}
      <div className="w-full max-w-7xl mx-auto flex-1 grid grid-cols-2 gap-16 p-8 items-stretch py-12">
        
        {/* Lado Esquerdo: Info e Relógio (Alinhado no Canto Superior Esquerdo) */}
        <div className="flex flex-col justify-start">
          <h1 className="text-8xl font-light tracking-tight">{horaString}</h1>
          <p className="text-3xl font-light text-slate-400 mt-4 capitalize">
            {dataString}
          </p>
          
          <div className="mt-20">
            <h3 className="text-2xl text-slate-500 uppercase tracking-widest mb-1">SALA</h3>
            <h2 className="text-7xl font-bold tracking-tight text-white">{numeroApenas}</h2>
          </div>
        </div>

        {/* Lado Direito: Status e Agenda */}
        <div className="flex flex-col justify-center gap-6 h-full">
          
          {/* Quadrado Maior: Status Atual */}
          <div className={`p-10 rounded-[2rem] flex flex-col justify-center h-1/2 shadow-2xl transition-colors duration-500 ${dados.status === 'OCUPADA' ? 'bg-red-600' : 'bg-green-500'}`}>
            <h3 className="text-5xl font-semibold mb-4 tracking-tight">
              {dados.status === 'OCUPADA' ? 'Ocupada' : 'Livre Para Uso'}
            </h3>
            <p className="text-2xl opacity-90 font-light mb-auto">
              {dados.horarioUso}
            </p>
            {/* Só exibe o nome do cliente se a sala estiver de fato ocupada */}
            {dados.status === 'OCUPADA' && (
              <p className="text-4xl font-bold mt-8 line-clamp-1">
                {dados.clienteAtual}
              </p>
            )}
          </div>

          {/* Quadrado Translúcido: Próximos Horários (Glassmorphism) */}
          <div className="p-8 rounded-[2rem] bg-white/5 backdrop-blur-lg border border-white/10 flex flex-col justify-center h-1/2">
            {dados.blocosFuturos.length > 0 ? (
              <div className="flex flex-col gap-6">
                {dados.blocosFuturos.map((bloco, idx) => (
                  <div key={idx} className="flex flex-col border-b border-white/5 pb-4 last:border-0 last:pb-0">
                    <span className="text-lg font-medium text-slate-400 mb-1">{bloco.horario}</span>
                    <span className={`text-2xl font-semibold truncate ${bloco.ocupado ? 'text-white' : 'text-green-400'}`}>
                      {bloco.cliente}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xl text-slate-400 text-center">Fim do expediente</p>
            )}
          </div>

        </div>
      </div>

      {erro && <p className="absolute bottom-4 left-4 text-red-500 bg-red-950/50 px-4 py-2 rounded">{erro}</p>}
    </div>
  );
}