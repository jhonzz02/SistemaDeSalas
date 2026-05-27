import { redirect } from "next/navigation";

export default function Home() {
  // Redireciona o usuário instantaneamente para a rota /login
  redirect("/login");
}