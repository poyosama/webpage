import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import "@/components/legal/legal.css";

export const metadata: Metadata = {
  title: "Política de privacidad · El tablero.",
  description: "Qué datos usa El tablero., para qué y cómo borrarlos.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="12 de noviembre de 2026">
      <p>
        El tablero. (<b>eltablero.blog</b>) es una plataforma para que artistas y productores organicen y compartan sus
        proyectos y tracks. Esta página explica qué datos usamos, para qué y cómo podés borrarlos.
      </p>

      <h2>Qué datos usamos</h2>
      <ul>
        <li>
          <b>Tu cuenta de Google:</b> cuando te suscribís con Google recibimos tu nombre, tu correo electrónico y tu
          foto de perfil. No recibimos tu contraseña ni accedemos a tu Gmail, Drive ni a ningún otro servicio de
          Google.
        </li>
        <li>
          <b>Lo que subís:</b> nombre de artista, @handle, bio, proyectos, tracks (audio), tapas, canvas y la
          información que cargues (BPM, tonalidad, créditos).
        </li>
        <li>
          <b>Uso de la app:</b> preferencias guardadas en tu dispositivo (tema claro/oscuro, volumen, último track) y
          los pases de invitación que generás o usás.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Crear y mantener tu cuenta y tu perfil.</li>
        <li>Guardar, reproducir y mostrar tus proyectos según la visibilidad que elijas (privado o público).</li>
        <li>Permitir los links para compartir y los pases de invitación.</li>
      </ul>
      <p>
        No vendemos tus datos ni los usamos para publicidad. Tus proyectos privados solo los ven vos y las personas a
        las que les compartas un link.
      </p>

      <h2>Dónde se guardan</h2>
      <p>
        Los datos se guardan en Supabase (base de datos y almacenamiento de archivos) y la web se sirve desde Vercel.
        El inicio de sesión lo hace Google. Estos proveedores procesan los datos solo para que el servicio funcione.
      </p>

      <h2>Tus derechos</h2>
      <ul>
        <li>Podés editar tu perfil cuando quieras desde <b>Perfil → Editar perfil</b>.</li>
        <li>
          Podés borrar tu cuenta desde <b>Perfil → ⚙ → Ajustes de cuenta → Borrar cuenta</b>. Se eliminan tu perfil,
          tus proyectos, tracks, tapas y canvas.
        </li>
        <li>
          Podés revocar el acceso de El tablero. a tu cuenta de Google en{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2>Menores</h2>
      <p>El tablero. no está dirigido a menores de 13 años.</p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, actualizamos la fecha de arriba y lo avisamos en la app.</p>

      <h2>Contacto</h2>
      <p>
        Por cualquier consulta sobre tus datos escribinos por Instagram a <b>@quetablero</b>.
      </p>
    </LegalPage>
  );
}
