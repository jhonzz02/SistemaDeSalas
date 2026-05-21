import { createClient } from '@supabase/supabase-js';

// Aqui nós estamos mandando o Next.js ir até o cofre (.env.local) e buscar os valores
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Essa linha é uma segurança: se você esqueceu de preencher o arquivo .env.local, o sistema te avisa com um erro claro.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Atenção: As variáveis de ambiente do Supabase não foram encontradas no arquivo .env.local');
}

// Aqui a mágica acontece: criamos o "cliente" de conexão que usaremos em todas as telas
export const supabase = createClient(supabaseUrl, supabaseAnonKey);