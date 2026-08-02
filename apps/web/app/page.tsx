import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">SGI La Comarca</p>
        <h1>Base técnica del monorepo</h1>
        <p className="lead">
          Esta es una superficie técnica de FASE 2. No es la interfaz final y
          todavía no contiene productos, inventario, ventas ni finanzas.
        </p>
        <div className="technical-grid" aria-label="Componentes preparados">
          <article className="technical-card">
            <h2>Web</h2>
            <p>Next.js, App Router, TypeScript estricto y Tailwind CSS.</p>
          </article>
          <article className="technical-card">
            <h2>API</h2>
            <p>NestJS REST, OpenAPI configurable y logging estructurado.</p>
          </article>
          <article className="technical-card">
            <h2>Persistencia</h2>
            <p>PostgreSQL local y Prisma sin entidades de negocio todavía.</p>
          </article>
        </div>
        <Link className="primary-link" href="/api-status">
          Comprobar estado de la API
        </Link>
      </section>
    </main>
  );
}
