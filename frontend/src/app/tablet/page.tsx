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

// 1. Nova Lista de imagens para o carrossel (Teste com 4 imagens iguais)
const IMAGENS_CARROSSEL = [
  "/itaipava_logo.jpg", 
  "/fonte_nova.jpeg",
  "/qpc.jpeg",
  "/sdb.jpeg"
];

export default function TabletPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [horaString, setHoraString] = useState("--:--");
  const [dataString, setDataString] = useState("Carregando data...");

  const [mostrarPropaganda, setMostrarPropaganda] = useState(false);
  const [adIndex, setAdIndex] = useState(0); // Controla qual imagem está na tela

  const [dados, setDados] = useState<DadosTela>({
    nomeSala: "Carregando...",
    status: "LIVRE",
    clienteAtual: "Buscando dados...",
    horarioUso: "--h - --h",
    blocosFuturos: [],
  });

  // 1. Relógio Local
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

  // 2. Motor de Abertura/Fechamento da Propaganda
  useEffect(() => {
    const cicloPropaganda = setInterval(() => {
      setAdIndex(0); // Sempre reseta para a primeira imagem ao abrir
      setMostrarPropaganda(true);

      setTimeout(() => {
        setMostrarPropaganda(false);
      }, 10000); // Fica 10s aberto (Tempo perfeito para 4 imagens x 2.5s)

    }, 30000); // Abre a cada 30 segundos

    return () => clearInterval(cicloPropaganda);
  }, []);

  // 3. Motor do Carrossel de Imagens (Troca a cada 2.5s quando aberto)
  useEffect(() => {
    let intervaloCarrossel: NodeJS.Timeout;
    
    if (mostrarPropaganda) {
      intervaloCarrossel = setInterval(() => {
        setAdIndex((prevIndex) => (prevIndex + 1) % IMAGENS_CARROSSEL.length);
      }, 2500);
    }

    return () => {
      if (intervaloCarrossel) clearInterval(intervaloCarrossel);
    };
  }, [mostrarPropaganda]);

  // 4. Sincronização com o Banco de Dados
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

        const { data: reservasBD, error: erroReserva } = await supabase
          .from("reservas")
          .select("cliente, inicio, fim")
          .eq("sala_numero", numeroSala)
          .eq("data", hoje)
          .gte("fim", agora)
          .order("inicio", { ascending: true });

        if (erroReserva) throw erroReserva;

        const salaOcupada = salaBD.status === 'OCUPADA';
        let clienteAtual = "Livre para Uso";
        let horarioUso = `${horaAtual}h - ${horaAtual + 1}h`;

        if (salaOcupada && reservasBD && reservasBD.length > 0) {
          const reservaAtual = reservasBD.find(r => r.inicio <= agora && r.fim > agora) || reservasBD[0];
          clienteAtual = reservaAtual.cliente;
          horarioUso = `${reservaAtual.inicio.substring(0, 5)}h - ${reservaAtual.fim.substring(0, 5)}h`;
        }

        const blocos: BlocoHorario[] = [];
        // AQUI ESTÁ A MUDANÇA: 'i <= 5' para puxar mais dois blocos (total de 5 horários futuros)
        for (let i = 1; i <= 5; i++) {
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

  const numeroApenas = dados.nomeSala.replace(/SALA\s*/i, "");
  const bgStatus = dados.status === 'OCUPADA' ? 'bg-red-600' : 'bg-[#5EF12D] text-slate-950';

  const iconeStatus = dados.status === 'OCUPADA' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
  );

  return (
    <div className="flex w-full h-screen bg-[#070b19] text-white overflow-hidden relative">
      
      <button onClick={handleLogout} className="absolute top-4 right-4 bg-white/5 text-slate-500 hover:bg-red-600/20 hover:text-red-400 px-4 py-2 rounded text-xs transition-all z-50 opacity-0 hover:opacity-100">
        Sair
      </button>

      {/* --- ÁREA DO LAYOUT PRINCIPAL --- */}
      <div className={`flex flex-col h-full transition-all duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] py-16 px-12 z-10 ${mostrarPropaganda ? 'w-[35%]' : 'w-full'}`}>
        
        <div className="flex-1 flex flex-row items-stretch w-full max-w-7xl mx-auto gap-16">
          
          {/* LADO ESQUERDO: Info e Relógio */}
          <div className={`flex flex-col justify-start transition-all duration-1000 ${mostrarPropaganda ? 'w-full' : 'w-1/2'}`}>
            
            <h1 className="text-[7rem] leading-none font-bold tracking-tighter">{horaString}</h1>
            <div className="flex items-center gap-3 mt-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              <p className="text-2xl font-light text-slate-300 uppercase tracking-widest">
                {dataString}
              </p>
            </div>
            
            <div className="w-full h-px bg-white/10 my-10"></div>

            <div>
              <h3 className="text-2xl text-slate-400 uppercase tracking-[0.3em] mb-2 font-light">SALA</h3>
              <h2 className={`font-black tracking-tighter transition-all duration-1000 ${mostrarPropaganda ? 'text-8xl text-green-400' : 'text-8xl text-white'}`}>
                {numeroApenas}
              </h2>
            </div>

            {/* BLOCO DE STATUS REDUZIDO */}
            <div className={`transition-all duration-1000 ease-in-out overflow-hidden mt-12 ${mostrarPropaganda ? 'opacity-100 max-h-48 translate-y-0' : 'opacity-0 max-h-0 translate-y-10'}`}>
               <div className={`p-6 rounded-3xl flex items-center gap-6 shadow-2xl ${bgStatus}`}>
                  <div className="w-16 h-16 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                    {iconeStatus}
                  </div>
                  <div>
                    <p className="font-medium opacity-80 mb-1">{dados.horarioUso}</p>
                    <p className="text-3xl font-bold tracking-tight line-clamp-1">
                      {dados.status === 'OCUPADA' ? dados.clienteAtual : 'LIVRE PARA USO'}
                    </p>
                  </div>
               </div>
            </div>

          </div>

          {/* LADO DIREITO: Agenda Completa */}
          <div className={`flex flex-col justify-center gap-6 h-full transition-all duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] origin-left ${mostrarPropaganda ? 'w-0 opacity-0 overflow-hidden scale-95' : 'w-1/2 opacity-100 scale-100'}`}>
            
            <div className={`p-8 rounded-[2rem] flex items-center gap-6 shadow-2xl transition-colors duration-500 ${bgStatus}`}>
              <div className="w-20 h-20 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                {iconeStatus}
              </div>
              <div className="flex flex-col overflow-hidden">
                <p className="text-2xl opacity-90 mb-1">{dados.horarioUso}</p>
                <p className="text-5xl font-bold tracking-tight truncate">
                  {dados.status === 'OCUPADA' ? dados.clienteAtual : 'LIVRE PARA USO'}
                </p>
              </div>
            </div>

            <div className="p-8 rounded-[2rem] bg-white/5 backdrop-blur-lg border border-white/10 flex flex-col justify-center flex-1">
              {dados.blocosFuturos.length > 0 ? (
                <div className="flex flex-col gap-6">
                  {dados.blocosFuturos.map((bloco, idx) => (
                    <div key={idx} className="flex flex-col border-b border-white/5 pb-4 last:border-0 last:pb-0">
                      <span className="text-lg font-medium text-slate-400 mb-1">{bloco.horario}</span>
                      <span className={`text-2xl font-semibold truncate ${bloco.ocupado ? 'text-white' : 'text-[#5EF12D]'}`}>
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
      </div>

      {/* --- ÁREA DO PAINEL DE PROPAGANDA --- */}
      <div className={`absolute right-0 top-0 h-full shadow-2xl flex flex-col items-center justify-end pb-16 transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] z-40 rounded-l-[4rem] overflow-hidden ${mostrarPropaganda ? 'translate-x-0 w-[65%]' : 'translate-x-full w-[65%]'}`}>
         
         {/* Background escuro de fallback caso a imagem demore um milissegundo para carregar */}
         <div className="absolute inset-0 bg-slate-950 -z-10"></div>
         
         {/* CARROSSEL DE IMAGENS OCUPANDO TODO O BACKGROUND */}
         <div className="absolute inset-0 w-full h-full z-0">
           {IMAGENS_CARROSSEL.map((src, idx) => (
             <img 
               key={idx}
               src={src}
               alt={`Patrocinador ${idx + 1}`}
               className={`absolute w-full h-full object-cover transition-opacity duration-500 ease-in-out ${idx === adIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
             />
           ))}
           {/* Overlay escuro sutil para garantir que as barrinhas fiquem sempre visíveis sobre qualquer imagem */}
           <div className="absolute inset-0 bg-black/20 z-20 pointer-events-none"></div>
         </div>
         
         {/* INDICADORES DO CARROSSEL (Barrinhas dinâmicas) */}
         <div className="relative z-30 flex gap-3">
           {IMAGENS_CARROSSEL.map((_, idx) => (
             <div 
               key={idx} 
               className={`h-2 rounded-full transition-all duration-500 shadow-lg ${idx === adIndex ? 'w-12 bg-[#cbf12d]' : 'w-8 bg-white/50'}`}
             ></div>
           ))}
         </div>
      </div>

      {erro && <p className="absolute bottom-4 left-4 text-red-500 bg-red-950/50 px-4 py-2 rounded z-50">{erro}</p>}
    </div>
  );
}