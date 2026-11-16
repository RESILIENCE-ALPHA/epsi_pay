import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { ServiceBanner } from './ServiceBanner';
import { Activity, ShieldCheck, Zap } from './icons';

// Habillage commun aux écrans de connexion et d'inscription : panneau de présentation à gauche,
// formulaire à droite. Un seul endroit à modifier pour que les deux écrans restent identiques.

const HIGHLIGHTS = [
  { icon: <Zap />, title: 'Paiements instantanés', text: 'Envoyez de l’argent à n’importe quel compte EPSI Pay avec une simple adresse e-mail.' },
  { icon: <ShieldCheck />, title: 'Sécurité active', text: 'Détection des attaques en temps réel et blocage automatique des accès suspects.' },
  { icon: <Activity />, title: 'Toujours disponible', text: 'Une plateforme qui se rétablit seule : aucun paiement perdu, jamais de double débit.' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      <ServiceBanner />
      <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Panneau de présentation */}
        <aside className="relative hidden overflow-hidden border-r border-white/[0.06] bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-500/25 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-48 right-0 h-[420px] w-[420px] rounded-full bg-sky-400/10 blur-[120px]" />

          <Logo className="relative text-[40px] text-white" />

          <div className="relative max-w-md">
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-white">
              L&rsquo;argent circule.
              <br />
              <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
                La sécurité reste.
              </span>
            </h1>
            <ul className="mt-10 space-y-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg text-brand-300">
                    {item.icon}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/30">Projet Workshop EPSI · RESILIENCE-ALPHA</p>
        </aside>

        {/* Formulaire */}
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-[400px]">
            <Logo className="mb-10 text-[34px] text-white lg:hidden" />
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
