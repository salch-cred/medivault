'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ShieldPlus,
  Lock,
  Share2,
  FileSearch,
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Database,
  Sparkles,
  Twitter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  spring,
  springSoft,
  staggerContainer,
  staggerItem,
} from '@/lib/motion'

/* ------------------------------------------------------------------ */
/* Hero — word-by-word staggered reveal (purelanding-style editorial)  */
/* ------------------------------------------------------------------ */

function HeroHeadline() {
  const reduce = useReducedMotion()
  const words = ['Your', 'health', 'history,', 'cryptographically', 'yours.']
  return (
    <h1 className="max-w-4xl text-balance font-serif text-[2.75rem] leading-[1.02] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.5rem]">
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: '0.5em' }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ ...springSoft, delay: 0.15 + i * 0.07 }}
        >
          {i === 4 ? (
            // Last word gets the gradient emphasis.
            <em className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text font-serif not-italic text-transparent">
              {w}
            </em>
          ) : (
            w
          )}
          {i < words.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </h1>
  )
}

/* ------------------------------------------------------------------ */
/* Stat — part of the in-view stats strip                              */
/* ------------------------------------------------------------------ */

function Stat({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  return (
    <motion.div variants={staggerItem} className="text-center">
      <div className="font-serif text-4xl tracking-tight md:text-5xl">
        {value}
        {suffix ? <span className="text-primary">{suffix}</span> : null}
      </div>
      <p className="mx-auto mt-1 max-w-[12rem] text-sm text-muted-foreground">{label}</p>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Feature card with hover gradient reveal                             */
/* ------------------------------------------------------------------ */

type Feature = {
  icon: typeof Lock
  title: string
  body: string
  tone: string
  span?: string
}

const FEATURES: Feature[] = [
  {
    icon: Lock,
    title: 'End-to-end encrypted',
    body: 'Data is AES-256 encrypted in your browser before it ever leaves. Your private key never touches a server — there is no central database to breach.',
    tone: 'from-primary/10 to-transparent',
    span: 'md:col-span-2',
  },
  {
    icon: FileSearch,
    title: 'Tamper-proof',
    body: 'Every record is anchored to 0G with an immutable Merkle root. Verify integrity anytime.',
    tone: 'from-blue-500/10 to-transparent',
  },
  {
    icon: Share2,
    title: 'Granular sharing',
    body: 'Share via ECIES — only your doctor\u2019s exact wallet can decipher the payload.',
    tone: 'from-emerald-500/10 to-transparent',
  },
  {
    icon: Cpu,
    title: 'Decentralized compute',
    body: '0G Compute parses dense lab results into plain language without centralized cloud APIs that monitor your traffic.',
    tone: 'from-purple-500/10 to-transparent',
    span: 'md:col-span-2',
  },
]

function FeatureCard({ f }: { f: Feature }) {
  const reduce = useReducedMotion()
  const Icon = f.icon
  return (
    <motion.div
      variants={staggerItem}
      whileHover={reduce ? undefined : { y: -4 }}
      transition={spring}
      className={`group relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/40 p-7 backdrop-blur-sm md:p-9 ${f.span ?? ''}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.tone} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.04] text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-serif text-xl tracking-tight md:text-2xl">{f.title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground md:text-[15px]">
          {f.body}
        </p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const hero = staggerContainer(0, 0.1)
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Soft ambient glows — only on md+ (heavy blur is costly on mobile). */}
      <div className="pointer-events-none fixed inset-0 hidden overflow-hidden md:block">
        <div className="absolute top-[-10%] left-[20%] h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[40%] right-[-10%] h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      {/* ---------- Sticky frosted nav ---------- */}
      <header className="sticky top-0 z-40 pt-safe">
        <div className="border-b border-border/40 bg-background/70 backdrop-blur-xl">
          <div className="container flex h-14 items-center justify-between md:h-16">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm">
                <ShieldPlus className="h-4 w-4" />
              </span>
              <span className="text-lg">MediVault</span>
            </Link>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/0glabs/0g-storage-client"
                target="_blank"
                rel="noreferrer"
                className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
              >
                0G Storage
              </a>
              <Button asChild variant="default" className="rounded-full px-5">
                <Link href="/vault">
                  Enter Vault <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* ---------- Hero ---------- */}
        <section className="container flex flex-col items-center px-safe pt-16 pb-20 text-center md:pt-32 md:pb-36">
          <motion.div
            variants={hero}
            initial="hidden"
            animate="show"
            className="flex w-full flex-col items-center"
          >
            <motion.a
              variants={staggerItem}
              href="https://0g.ai"
              target="_blank"
              rel="noreferrer"
              className="group mb-7 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1.5 text-sm font-medium backdrop-blur-md transition-colors hover:bg-muted/70"
            >
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              Built on 0G Mainnet
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </motion.a>

            <HeroHeadline />

            <motion.p
              variants={staggerItem}
              className="mx-auto mt-7 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl"
            >
              Store, decode, and manage your medical records. Secured by zero-knowledge
              architecture on the 0G Network — readable by absolutely no one but you.
            </motion.p>

            <motion.div
              variants={staggerItem}
              className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
            >
              <Button asChild size="lg" className="h-14 w-full rounded-full px-8 text-base shadow-lg sm:w-auto">
                <Link href="/vault">
                  Open your vault <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </section>

        {/* ---------- Stats strip ---------- */}
        <motion.section
          variants={staggerContainer(0.12, 0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="border-y border-border/40 bg-muted/20"
        >
          <div className="container px-safe">
            <div className="grid grid-cols-2 divide-x divide-y divide-border/40 md:grid-cols-4 md:divide-y-0">
              <div className="px-4 py-8 md:py-10">
                <Stat value={256} suffix="-bit" label="AES client-side encryption" />
              </div>
              <div className="px-4 py-8 md:py-10">
                <Stat value={0} label="Central databases holding your data" />
              </div>
              <div className="px-4 py-8 md:py-10">
                <Stat value={100} suffix="%" label="Owned by your wallet, not us" />
              </div>
              <div className="px-4 py-8 md:py-10">
                <Stat value={24} suffix="/7" label="Decentralized storage uptime" />
              </div>
            </div>
          </div>
        </motion.section>

        {/* ---------- Feature section ---------- */}
        <section className="container px-safe py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="mb-10 max-w-2xl md:mb-16"
          >
            <span className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Infrastructure
            </span>
            <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
              Zero-compromise by design.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Built to ensure your data outlives any single company.
            </p>
          </motion.div>

          {/* ---------- Feature bento grid ---------- */}
          <motion.div
            variants={staggerContainer(0.1, 0.05)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 gap-5 md:grid-cols-3"
          >
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} f={f} />
            ))}
          </motion.div>
        </section>

        {/* ---------- Big CTA ---------- */}
        <section className="container px-safe pb-24 md:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-foreground to-foreground/80 px-8 py-16 text-center text-background md:rounded-[2.5rem] md:px-16 md:py-24"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/30 blur-[100px]" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-accent/20 blur-[100px]" />
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
                Your body. Your data.
              </h2>
              <p className="mx-auto mt-5 max-w-md text-lg text-background/70">
                Take ownership of your medical history in minutes. No accounts, no servers,
                no one but you.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-9 h-14 rounded-full bg-background px-8 text-base text-foreground hover:bg-background/90"
              >
                <Link href="/vault">
                  Open your vault <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="container px-safe pb-10 pt-6 md:pb-12">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/20 pt-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2 font-medium">
            <ShieldPlus className="h-4 w-4" /> MediVault
          </div>
          <div className="flex items-center gap-4">
            <p>© {new Date().getFullYear()} — Built for 0G Zero Cup</p>
            <span className="hidden h-4 w-px bg-border/40 md:block" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground/80">by</span>
              <a href="https://x.com/sahilvishnaliya?s=21" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Twitter className="h-3.5 w-3.5" /> Sahil
              </a>
              <a href="https://x.com/salmanch_?s=11" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Twitter className="h-3.5 w-3.5" /> Sal
              </a>
            </div>
          </div>
          <a
            href="https://uncut.wtf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Database className="h-3.5 w-3.5" /> Type by uncut.wtf
          </a>
        </div>
      </footer>
    </div>
  )
}
