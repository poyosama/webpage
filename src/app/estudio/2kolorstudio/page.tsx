import type { Metadata } from "next";
import { StudioShowcase } from "@/components/Showcase";
import "../../showcase.css";

export const metadata: Metadata = {
  title: "2kolorstudio — El tablero.",
  description: "Estudio creativo: VFX, CGI, 3D e IA. Los proyectos de El tablero con visuales de 2kolorstudio.",
};

export default function Page() {
  return <StudioShowcase slug="2kolorstudio" />;
}
