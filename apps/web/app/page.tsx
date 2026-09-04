import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Portal · SGI La Comarca',
};

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">SGI La Comarca</p>
        <h1>Gestión operativa en un solo lugar</h1>
        <p className="lead">
          Consulta existencias, registra ventas y controla las finanzas con el
          acceso correspondiente a tu rol.
        </p>
        <div className="technical-grid" aria-label="Áreas de gestión">
          <article className="technical-card">
            <h2>Inventario</h2>
            <p>Productos, existencias, movimientos, traslados y conteos.</p>
          </article>
          <article className="technical-card">
            <h2>Ventas</h2>
            <p>Registro, seguimiento y consulta de operaciones comerciales.</p>
          </article>
          <article className="technical-card">
            <h2>Finanzas</h2>
            <p>Ingresos, gastos, cierres diarios, reportes y análisis.</p>
          </article>
        </div>
        <Link className="primary-link" href="/login">
          Iniciar sesión
        </Link>
      </section>
    </main>
  );
}
