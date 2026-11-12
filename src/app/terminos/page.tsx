import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import "@/components/legal/legal.css";

export const metadata: Metadata = {
  title: "Términos · El tablero.",
  description: "Condiciones de uso de El tablero.",
};

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso" updated="12 de noviembre de 2026">
      <p>Al suscribirte a El tablero. (eltablero.blog) aceptás estas condiciones.</p>

      <h2>La suscripción</h2>
      <p>
        El acceso es por invitación: necesitás un pase de alguien que ya está suscrito. Cada pase se puede usar una sola
        vez.
      </p>

      <h2>Tu contenido</h2>
      <ul>
        <li>Lo que subís (tracks, tapas, canvas, textos) sigue siendo tuyo.</li>
        <li>
          Nos das permiso para guardarlo y mostrarlo dentro de El tablero. según la visibilidad que elijas, solo para
          que el servicio funcione.
        </li>
        <li>
          Solo subí contenido que sea tuyo o que tengas derecho a compartir. Podemos sacar contenido que infrinja
          derechos de otros.
        </li>
      </ul>

      <h2>Uso correcto</h2>
      <p>
        No uses El tablero. para acosar, engañar o hacerle daño a otras personas, ni para intentar acceder a cuentas o
        proyectos que no te compartieron.
      </p>

      <h2>Cuenta</h2>
      <p>
        Podés borrar tu cuenta cuando quieras desde los Ajustes de cuenta. Podemos suspender cuentas que no respeten
        estos términos.
      </p>

      <h2>El servicio</h2>
      <p>
        El tablero. está en desarrollo y puede cambiar o tener fallas. Hacemos lo posible para que tus archivos estén
        seguros, pero te recomendamos guardar copias de tus proyectos.
      </p>

      <h2>Contacto</h2>
      <p>
        Instagram: <b>@quetablero</b>.
      </p>
    </LegalPage>
  );
}
