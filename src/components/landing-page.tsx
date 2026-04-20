import {
    ClaudeIcon,
    GoogleIcon,
    OpenAIIcon,
    OpenRouterIcon,
    XAIIcon
} from "@/components/brand-icons"
import { LogoMark } from "@/components/logo"
import { MagicCard } from "@/components/magic-cards"
import { MagneticButton } from "@/components/magnetic-button"
import { ThemeSwitcher } from "@/components/themes/theme-switcher"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { useGSAP } from "@gsap/react"
import { Link } from "@tanstack/react-router"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import {
    ArrowRight,
    BrainCircuit,
    Check,
    FileText,
    FileUp,
    Github,
    Globe,
    Image as ImageIcon,
    Minus,
    ShieldCheck,
    Users
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

gsap.registerPlugin(ScrollTrigger)

export function LandingPage() {
    const [activeSection, setActiveSection] = useState(0)
    const [isNavVisible, setIsNavVisible] = useState(true)
    const lastScrollY = useRef(0)

    const containerRef = useRef<HTMLDivElement>(null)
    const heroRef = useRef<HTMLDivElement>(null)
    const headlineRef = useRef<HTMLHeadingElement>(null)
    const subtitleRef = useRef<HTMLParagraphElement>(null)
    const ctaRef = useRef<HTMLDivElement>(null)
    const logosRef = useRef<HTMLDivElement>(null)

    // Hero Animation
    useGSAP(
        () => {
            const tl = gsap.timeline()

            tl.fromTo(
                ".hero-word",
                { y: 120, rotationX: -80, opacity: 0, scale: 0.8 },
                {
                    y: 0,
                    rotationX: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 1.4,
                    stagger: 0.05,
                    ease: "power4.out",
                    delay: 0.1
                }
            )
                .fromTo(
                    subtitleRef.current,
                    { y: 30, opacity: 0, filter: "blur(12px)" },
                    { y: 0, opacity: 1, filter: "blur(0px)", duration: 1.2, ease: "power3.out" },
                    "-=1"
                )
                .fromTo(
                    ctaRef.current,
                    { y: 40, opacity: 0, scale: 0.8 },
                    { y: 0, opacity: 1, scale: 1, duration: 1.5, ease: "elastic.out(1, 0.4)" },
                    "-=1"
                )
                .fromTo(
                    logosRef.current?.children || [],
                    { y: 20, opacity: 0, scale: 0.5 },
                    {
                        y: 0,
                        opacity: 0.5,
                        scale: 1,
                        duration: 0.8,
                        stagger: 0.1,
                        ease: "back.out(1.5)"
                    },
                    "-=1.2"
                )
        },
        { scope: containerRef }
    )

    // Scroll Trigger Animations
    useGSAP(
        () => {
            const scroller = containerRef.current
            if (!scroller) return

            gsap.fromTo(
                ".feature-header",
                { y: 40, opacity: 0, filter: "blur(10px)" },
                {
                    y: 0,
                    opacity: 1,
                    filter: "blur(0px)",
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#features", scroller, start: "top 75%" }
                }
            )
            gsap.fromTo(
                ".feature-card",
                { y: 50, opacity: 0, scale: 0.95 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.8,
                    stagger: 0.1,
                    ease: "back.out(1.2)",
                    scrollTrigger: { trigger: "#features", scroller, start: "top 65%" }
                }
            )

            gsap.fromTo(
                ".showcase-header",
                { y: 40, opacity: 0, filter: "blur(10px)" },
                {
                    y: 0,
                    opacity: 1,
                    filter: "blur(0px)",
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#showcase", scroller, start: "top 75%" }
                }
            )
            gsap.fromTo(
                ".showcase-item",
                { y: 50, opacity: 0, scale: 0.98 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 1.2,
                    stagger: 0.2,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#showcase", scroller, start: "top 65%" }
                }
            )

            gsap.fromTo(
                ".comparison-content",
                { y: 40, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#comparison", scroller, start: "top 75%" }
                }
            )

            gsap.fromTo(
                ".pricing-header",
                { y: 40, opacity: 0, filter: "blur(10px)" },
                {
                    y: 0,
                    opacity: 1,
                    filter: "blur(0px)",
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#byok", scroller, start: "top 75%" }
                }
            )
            gsap.fromTo(
                ".pricing-card",
                { y: 60, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    stagger: 0.2,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#byok", scroller, start: "top 65%" }
                }
            )

            gsap.fromTo(
                ".security-content",
                { y: 40, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#security", scroller, start: "top 75%" }
                }
            )

            gsap.fromTo(
                ".faq-content",
                { y: 40, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#faq", scroller, start: "top 80%" }
                }
            )

            gsap.fromTo(
                ".cta-header",
                { y: 30, opacity: 0, scale: 0.9 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: { trigger: "#cta", scroller, start: "top 80%" }
                }
            )
            gsap.fromTo(
                ".cta-button",
                { y: 40, opacity: 0, scale: 0.8 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 1.5,
                    ease: "elastic.out(1, 0.4)",
                    scrollTrigger: { trigger: "#cta", scroller, start: "top 70%" }
                }
            )
        },
        { scope: containerRef }
    )

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleScroll = () => {
            const currentScrollY = container.scrollTop

            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                setIsNavVisible(false)
            } else {
                setIsNavVisible(true)
            }
            lastScrollY.current = currentScrollY

            const sections = container.querySelectorAll("section")
            const scrollPosition = currentScrollY + container.clientHeight / 2

            sections.forEach((section, index) => {
                const sectionTop = section.offsetTop
                const sectionHeight = section.offsetHeight

                if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                    setActiveSection(index)
                }
            })
        }

        container.addEventListener("scroll", handleScroll)
        return () => container.removeEventListener("scroll", handleScroll)
    }, [])

    const sections = [
        { id: "hero", label: "Hero" },
        { id: "features", label: "Features" },
        { id: "showcase", label: "Interface" },
        { id: "comparison", label: "Comparison" },
        { id: "byok", label: "Pricing" },
        { id: "security", label: "Security" },
        { id: "faq", label: "FAQ" },
        { id: "cta", label: "Get Started" }
    ]

    return (
        <div
            ref={containerRef}
            className="h-screen snap-y snap-mandatory overflow-y-auto overflow-x-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground"
        >
            {/* Nav */}
            <nav
                className={`fixed top-0 z-50 flex w-full items-center justify-between bg-background/40 px-4 py-2 backdrop-blur-md transition-transform duration-500 ease-in-out md:px-6 ${
                    isNavVisible && sections[activeSection]?.id !== "showcase"
                        ? "translate-y-0"
                        : "-translate-y-full"
                }`}
            >
                <div className="flex items-center gap-2">
                    <LogoMark className="h-auto w-24 md:w-32" />
                </div>

                <div className="pointer-events-auto flex items-center space-x-1 rounded-xl bg-background/10 p-1 backdrop-blur-sm md:space-x-2 md:p-2">
                    <ThemeSwitcher />
                    <div className="h-4 w-px bg-border" />
                    <Link to="/about" className="hidden sm:block">
                        <Button variant="ghost" size="sm">
                            About
                        </Button>
                    </Link>
                    <Link to="/auth/$pathname" params={{ pathname: "login" }}>
                        <Button size="sm" className="px-4 md:px-5">
                            Sign In
                        </Button>
                    </Link>
                </div>
            </nav>

            {/* Scroll Indicators */}
            <div className="-translate-y-1/2 fixed top-1/2 right-6 z-50 flex flex-col gap-4">
                {sections.map((section, index) => (
                    <button
                        key={section.id}
                        type="button"
                        onClick={() =>
                            document
                                .getElementById(section.id)
                                ?.scrollIntoView({ behavior: "smooth" })
                        }
                        className="group relative flex items-center justify-end"
                        aria-label={`Go to ${section.label}`}
                    >
                        <span className="absolute right-6 rounded-md bg-background/80 px-2 py-1 font-medium text-xs opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                            {section.label}
                        </span>
                        <div
                            className={`h-2 w-2 rounded-full transition-all duration-300 ${
                                activeSection === index
                                    ? "h-8 bg-primary shadow-lg shadow-primary/50"
                                    : "bg-muted-foreground/30 shadow-sm hover:bg-muted-foreground/60"
                            }`}
                        />
                    </button>
                ))}
            </div>

            <main className="w-full">
                {/* 1. Hero */}
                <section
                    id="hero"
                    ref={heroRef}
                    className="flex min-h-screen snap-start flex-col items-center justify-center px-6 pt-24 text-center"
                >
                    <div className="flex flex-col items-center justify-center">
                        <h1
                            ref={headlineRef}
                            className="mx-auto mb-8 flex max-w-4xl flex-wrap justify-center gap-x-4 font-bold text-5xl leading-[1.1] tracking-normal md:text-7xl lg:text-8xl"
                            style={{ perspective: "1000px" }}
                        >
                            {"The intelligent way to chat with any AI."
                                .split(" ")
                                .map((word, i) => (
                                    <span
                                        key={i}
                                        className="-mb-2 inline-flex overflow-hidden pb-2"
                                    >
                                        <span className="hero-word inline-block origin-bottom bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                                            {word}
                                        </span>
                                    </span>
                                ))}
                        </h1>

                        <p
                            ref={subtitleRef}
                            className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground md:text-xl"
                        >
                            One platform, all the best models. Experience the next generation of AI
                            chat with multi-modal support, web search, and stunning image
                            generation.
                        </p>

                        <div
                            ref={ctaRef}
                            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
                        >
                            <MagneticButton>
                                <Link to="/auth/$pathname" params={{ pathname: "login" }}>
                                    <Button
                                        size="lg"
                                        className="h-14 px-8 font-semibold text-lg shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                                    >
                                        Get Started Free
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </MagneticButton>
                        </div>
                    </div>

                    <div
                        ref={logosRef}
                        className="mt-20 flex flex-wrap justify-center gap-8 opacity-50 grayscale transition-all hover:opacity-100 hover:grayscale-0 md:gap-16"
                    >
                        <OpenAIIcon className="h-8 w-8" />
                        <ClaudeIcon className="h-8 w-8 text-[#D97757]" />
                        <GoogleIcon className="h-8 w-8" />
                        <XAIIcon className="h-8 w-8" />
                        <OpenRouterIcon className="h-8 w-8" />
                    </div>
                </section>

                {/* 2. Features */}
                <section
                    id="features"
                    className="flex min-h-screen snap-start flex-col items-center justify-center px-6 py-20"
                >
                    <div className="container mx-auto">
                        <div className="feature-header mb-16 text-center">
                            <h2 className="mb-4 font-bold text-3xl md:text-5xl">
                                Everything you need
                            </h2>
                            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                                Built for power users and teams who want the most out of their AI
                                experience.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <MagicCard
                                gradientFrom="rgba(59, 130, 246, 0.2)"
                                gradientTo="rgba(37, 99, 235, 0.1)"
                                className="feature-card rounded-xl p-8"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                                    <BrainCircuit className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Multi-Model Mastery</h3>
                                <p className="text-muted-foreground">
                                    Switch between GPT-5.4, Claude 4.6, Gemini 3.1 Pro, and dozens
                                    more instantly.
                                </p>
                            </MagicCard>

                            <MagicCard
                                gradientFrom="rgba(16, 185, 129, 0.2)"
                                gradientTo="rgba(5, 150, 105, 0.1)"
                                className="feature-card rounded-xl p-8"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Globe className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Real-time Web Search</h3>
                                <p className="text-muted-foreground">
                                    Ground your chats with the latest information from the web for
                                    accurate, up-to-date answers.
                                </p>
                            </MagicCard>

                            <MagicCard
                                gradientFrom="rgba(249, 115, 22, 0.2)"
                                gradientTo="rgba(234, 88, 12, 0.1)"
                                className="feature-card rounded-xl p-8"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                                    <ImageIcon className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Stunning Image Gen</h3>
                                <p className="text-muted-foreground">
                                    Create and manage your images in our innovative Library View
                                    using Nano Banana, Seedream, FLUX, and more.
                                </p>
                            </MagicCard>

                            <MagicCard
                                gradientFrom="rgba(139, 92, 246, 0.2)"
                                gradientTo="rgba(124, 58, 237, 0.1)"
                                className="feature-card rounded-xl p-8"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Smart Artifacts</h3>
                                <p className="text-muted-foreground">
                                    Preview your code and documents on the fly without switching
                                    tabs.
                                </p>
                            </MagicCard>

                            <MagicCard
                                gradientFrom="rgba(236, 72, 153, 0.2)"
                                gradientTo="rgba(219, 39, 119, 0.1)"
                                className="feature-card relative overflow-hidden rounded-xl p-8"
                            >
                                <div className="absolute top-0 right-0 rounded-bl-xl bg-pink-500/20 px-3 py-1 font-bold text-[10px] text-pink-600 uppercase tracking-wider shadow-sm backdrop-blur-md">
                                    New Feature
                                </div>
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
                                    <FileUp className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Universal Import</h3>
                                <p className="text-muted-foreground">
                                    Migrate your existing conversations from ChatGPT, Claude, and
                                    other platforms effortlessly with a single click.
                                </p>
                            </MagicCard>

                            <MagicCard
                                gradientFrom="rgba(6, 182, 212, 0.2)"
                                gradientTo="rgba(8, 145, 178, 0.1)"
                                className="feature-card relative overflow-hidden rounded-xl p-8"
                            >
                                <div className="absolute top-0 right-0 rounded-bl-xl bg-cyan-500/20 px-3 py-1 font-bold text-[10px] text-cyan-600 uppercase tracking-wider shadow-sm backdrop-blur-md">
                                    New Feature
                                </div>
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                                    <Users className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 font-bold text-xl">Custom Personas</h3>
                                <p className="text-muted-foreground">
                                    Craft tailored AI personalities with unique system prompts and
                                    context to suit your specific workflows and tasks.
                                </p>
                            </MagicCard>
                        </div>
                    </div>
                </section>

                {/* 3. Interface */}
                <section
                    id="showcase"
                    className="flex min-h-[150vh] snap-start flex-col items-center justify-center bg-muted/10 px-4 py-20 md:min-h-screen md:px-8 lg:min-h-[120vh]"
                >
                    <div className="mx-auto w-full max-w-[1400px]">
                        <div className="showcase-header mb-12 text-center">
                            <h2 className="mb-4 font-bold text-3xl md:text-5xl">
                                Experience the Interface
                            </h2>
                            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                                A beautifully crafted workspace for all your AI interactions.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-16 pb-10 lg:grid-cols-2 lg:gap-12">
                            <div className="showcase-item flex snap-center flex-col gap-4 md:snap-align-none">
                                <h3 className="px-2 text-center font-semibold text-2xl lg:text-left">
                                    Chat Experience
                                </h3>
                                <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/30 shadow-2xl">
                                    <img
                                        src="/screenshots/desktop/chat-desktop-light.png"
                                        alt="Chat Desktop Light"
                                        className="hidden h-auto w-full bg-background object-contain md:block dark:md:hidden"
                                    />
                                    <img
                                        src="/screenshots/desktop/chat-desktop-dark.png"
                                        alt="Chat Desktop Dark"
                                        className="hidden h-auto w-full bg-background object-contain md:dark:block"
                                    />
                                    <img
                                        src="/screenshots/mobile/chat-mobile-light.png"
                                        alt="Chat Mobile Light"
                                        className="block h-auto w-full bg-background object-contain md:hidden dark:hidden"
                                    />
                                    <img
                                        src="/screenshots/mobile/chat-mobile-dark.png"
                                        alt="Chat Mobile Dark"
                                        className="hidden h-auto w-full bg-background object-contain dark:block dark:md:hidden"
                                    />
                                </div>
                            </div>

                            <div className="showcase-item flex snap-center flex-col gap-4 pt-8 md:snap-align-none lg:pt-0">
                                <h3 className="px-2 text-center font-semibold text-2xl lg:text-left">
                                    Library & Artifacts
                                </h3>
                                <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/30 shadow-2xl">
                                    <img
                                        src="/screenshots/desktop/library-desktop-light.png"
                                        alt="Library Desktop Light"
                                        className="hidden h-auto w-full bg-background object-contain md:block dark:md:hidden"
                                    />
                                    <img
                                        src="/screenshots/desktop/library-desktop-dark.png"
                                        alt="Library Desktop Dark"
                                        className="hidden h-auto w-full bg-background object-contain md:dark:block"
                                    />
                                    <img
                                        src="/screenshots/mobile/library-mobile-light.png"
                                        alt="Library Mobile Light"
                                        className="block h-auto w-full bg-background object-contain md:hidden dark:hidden"
                                    />
                                    <img
                                        src="/screenshots/mobile/library-mobile-dark.png"
                                        alt="Library Mobile Dark"
                                        className="hidden h-auto w-full bg-background object-contain dark:block dark:md:hidden"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Comparison */}
                <section
                    id="comparison"
                    className="flex min-h-[80vh] snap-start flex-col items-center justify-center bg-muted/10 px-6 py-20"
                >
                    <div className="comparison-content container mx-auto max-w-4xl text-center">
                        <h2 className="mb-4 font-bold text-3xl md:text-5xl">Why SilkChat?</h2>
                        <p className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground">
                            See how we stack up against traditional single-model AI subscriptions.
                        </p>

                        <div className="overflow-x-auto rounded-xl border border-border/50 bg-background/50 shadow-xl backdrop-blur-sm">
                            <table className="w-full table-fixed border-collapse text-left text-sm md:text-base">
                                <thead className="border-border/50 border-b bg-muted/50">
                                    <tr>
                                        <th className="w-1/3 p-4 font-semibold text-muted-foreground">
                                            Feature
                                        </th>
                                        <th className="w-1/3 border-border/50 border-l bg-primary/5 p-4 font-bold text-primary">
                                            SilkChat
                                        </th>
                                        <th className="w-1/3 border-border/50 border-l p-4 font-semibold text-muted-foreground">
                                            Traditional AI Apps
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    <tr className="transition-colors hover:bg-muted/20">
                                        <td className="p-4 text-muted-foreground">
                                            Models Available
                                        </td>
                                        <td className="border-border/50 border-l bg-primary/5 p-4 font-medium">
                                            All Providers (OpenAI, Anthropic, Google, etc.)
                                        </td>
                                        <td className="border-border/50 border-l p-4 text-muted-foreground">
                                            Locked to a single provider
                                        </td>
                                    </tr>
                                    <tr className="transition-colors hover:bg-muted/20">
                                        <td className="p-4 text-muted-foreground">Pricing Model</td>
                                        <td className="border-border/50 border-l bg-primary/5 p-4 font-medium">
                                            Credit based usage
                                        </td>
                                        <td className="border-border/50 border-l p-4 text-muted-foreground">
                                            Rigid $20/month subscription
                                        </td>
                                    </tr>
                                    <tr className="transition-colors hover:bg-muted/20">
                                        <td className="p-4 text-muted-foreground">Open Source</td>
                                        <td className="border-border/50 border-l bg-primary/5 p-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-500" />
                                                <span>Yes</span>
                                            </div>
                                        </td>
                                        <td className="border-border/50 border-l p-4 text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Minus className="h-4 w-4" />
                                                <span>No</span>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr className="transition-colors hover:bg-muted/20">
                                        <td className="p-4 text-muted-foreground">Data Control</td>
                                        <td className="border-border/50 border-l bg-primary/5 p-4 font-medium">
                                            You own your API keys and data
                                        </td>
                                        <td className="border-border/50 border-l p-4 text-muted-foreground">
                                            Data used for training (often by default)
                                        </td>
                                    </tr>
                                    <tr className="transition-colors hover:bg-muted/20">
                                        <td className="p-4 text-muted-foreground">
                                            Import History
                                        </td>
                                        <td className="border-border/50 border-l bg-primary/5 p-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                <Check className="h-4 w-4 text-emerald-500" />
                                                <span>Import from ChatGPT, Claude, and more</span>
                                            </div>
                                        </td>
                                        <td className="border-border/50 border-l p-4 text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Minus className="h-4 w-4" />
                                                <span>Locked into platform</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* 5. Pricing / BYOK */}
                <section
                    id="byok"
                    className="flex min-h-[130vh] snap-start flex-col items-center justify-center bg-muted/20 px-6 py-20 md:min-h-screen"
                >
                    <div className="container mx-auto max-w-5xl">
                        <div className="pricing-header mb-16 text-center">
                            <h2 className="mb-4 font-bold text-3xl md:text-5xl">Flexible Access</h2>
                            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                                Use our managed service or bring your own infrastructure.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-16 pb-10 md:grid-cols-2 md:gap-8">
                            <div className="flex snap-center flex-col md:snap-align-none">
                                <MagicCard
                                    gradientFrom="rgba(var(--primary), 0.1)"
                                    className="pricing-card flex flex-1 flex-col rounded-xl border-primary/50 bg-background/50 p-8 shadow-2xl"
                                >
                                    <div className="mb-6">
                                        <h3 className="font-bold text-2xl">Internal Credits</h3>
                                        <p className="mt-2 text-muted-foreground">
                                            Perfect for getting started without managing any keys.
                                        </p>
                                    </div>
                                    <div className="mb-8 space-y-4">
                                        {[
                                            "Access all premium models",
                                            "Shared credit pool",
                                            "Pay only for what you use",
                                            "No configuration required"
                                        ].map((item) => (
                                            <div key={item} className="flex items-center gap-3">
                                                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/20 text-primary">
                                                    <Check className="h-3 w-3" />
                                                </div>
                                                <span className="text-sm">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-auto">
                                        <Link to="/auth/$pathname" params={{ pathname: "login" }}>
                                            <Button className="w-full">Sign Up</Button>
                                        </Link>
                                    </div>
                                </MagicCard>
                            </div>

                            <div className="flex snap-center flex-col pt-10 md:snap-align-none md:pt-0">
                                <MagicCard className="pricing-card flex flex-1 flex-col rounded-xl bg-background/50 p-8">
                                    <div className="mb-6">
                                        <h3 className="font-bold text-2xl">Bring Your Own Key</h3>
                                        <p className="mt-2 text-muted-foreground">
                                            Full control over your data and costs.
                                        </p>
                                    </div>
                                    <div className="mb-8 space-y-4">
                                        {[
                                            "Connect OpenAI, Anthropic, Google",
                                            "Zero platform markup",
                                            "Your own usage limits",
                                            "Direct provider billing"
                                        ].map((item) => (
                                            <div key={item} className="flex items-center gap-3">
                                                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                    <Check className="h-3 w-3" />
                                                </div>
                                                <span className="text-sm">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-auto">
                                        <Link to="/auth/$pathname" params={{ pathname: "login" }}>
                                            <Button variant="outline" className="w-full">
                                                Configure BYOK
                                            </Button>
                                        </Link>
                                    </div>
                                </MagicCard>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 6. Security & Open Source */}
                <section
                    id="security"
                    className="flex min-h-[60vh] snap-start flex-col items-center justify-center bg-background px-6 py-20"
                >
                    <div className="security-content container mx-auto max-w-4xl">
                        <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-border/50 bg-muted/30 p-8 md:grid-cols-2 md:p-12">
                            <div>
                                <div className="mb-6 inline-flex items-center justify-center rounded-full bg-emerald-500/10 p-3 text-emerald-500">
                                    <ShieldCheck className="h-8 w-8" />
                                </div>
                                <h3 className="mb-4 font-bold text-3xl">Secure & Transparent</h3>
                                <p className="mb-6 text-muted-foreground">
                                    When you use BYOK, your API requests go directly to the
                                    provider. We don't act as a man-in-the-middle, meaning your
                                    sensitive conversations are never logged by us.
                                </p>
                                <a
                                    href="https://github.com/medy17/silkchat"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <Button variant="outline" className="gap-2">
                                        <Github className="h-4 w-4" />
                                        View Source Code
                                    </Button>
                                </a>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-start gap-4 rounded-lg border border-border/50 bg-background p-4 shadow-sm">
                                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                                    <div>
                                        <p className="font-semibold">Local API Keys</p>
                                        <p className="text-muted-foreground text-sm">
                                            Keys are stored securely in your browser.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4 rounded-lg border border-border/50 bg-background p-4 shadow-sm">
                                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                                    <div>
                                        <p className="font-semibold">Open Source</p>
                                        <p className="text-muted-foreground text-sm">
                                            Audit our code. Host it yourself if you prefer.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 7. FAQ */}
                <section
                    id="faq"
                    className="flex min-h-[80vh] snap-start flex-col items-center justify-center bg-muted/10 px-6 py-20"
                >
                    <div className="faq-content container mx-auto max-w-3xl">
                        <div className="mb-12 text-center">
                            <h2 className="mb-4 font-bold text-3xl md:text-5xl">
                                Common Questions
                            </h2>
                            <p className="text-lg text-muted-foreground">
                                Everything you need to know about SilkChat.
                            </p>
                        </div>

                        <Accordion
                            type="single"
                            collapsible
                            className="w-full rounded-xl border border-border/50 bg-background px-4 shadow-sm md:px-6"
                        >
                            <AccordionItem value="item-1">
                                <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                                    What does BYOK mean?
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                                    BYOK stands for "Bring Your Own Key". It means you can input
                                    your own API keys from providers like OpenAI, Anthropic, or
                                    Google directly into SilkChat.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-2">
                                <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                                    How do Internal Credits work?
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                                    If you don't want to manage multiple API keys, you can use our
                                    Internal Credits. Top up once and switch between any model
                                    seamlessly.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-3">
                                <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                                    Are my conversations private?
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                                    Yes. With BYOK your data goes straight to the provider. We do
                                    not use any user data to train models. The entire platform is
                                    open-source.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-4">
                                <AccordionTrigger className="py-6 text-left font-semibold text-lg">
                                    Can I import my ChatGPT history?
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                                    Absolutely. Our Universal Import feature lets you upload exports
                                    from ChatGPT, Claude, and other platforms.
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </section>

                {/* 8. Final CTA */}
                <section
                    id="cta"
                    className="flex min-h-screen snap-start flex-col items-center justify-center bg-primary px-6 py-20 text-center text-primary-foreground"
                >
                    <div>
                        <div className="cta-header">
                            <h2 className="mb-6 font-bold text-4xl leading-tight tracking-tight md:text-6xl">
                                Ready to join the future of chat?
                            </h2>
                            <p className="mx-auto mb-10 max-w-2xl text-lg opacity-90 md:text-xl">
                                Join thousands of users who are already exploring the frontiers of
                                AI with SilkChat. Free to start, forever powerful.
                            </p>
                        </div>
                        <div className="cta-button">
                            <MagneticButton>
                                <Link to="/auth/$pathname" params={{ pathname: "login" }}>
                                    <Button
                                        size="lg"
                                        variant="secondary"
                                        className="h-16 px-10 font-bold text-xl shadow-2xl transition-all hover:scale-105 active:scale-95"
                                    >
                                        Get Started for Free
                                        <ArrowRight className="ml-2 h-6 w-6" />
                                    </Button>
                                </Link>
                            </MagneticButton>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="snap-start border-border/40 border-t bg-muted/30 py-12">
                <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 md:flex-row">
                    <div className="flex items-center gap-2">
                        <LogoMark className="h-auto w-24" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                        &copy; {new Date().getFullYear()} SilkChat. All rights reserved.
                    </p>
                    <div className="flex gap-6">
                        <Link
                            to="/privacy-policy"
                            className="text-muted-foreground text-sm hover:text-foreground"
                        >
                            Privacy
                        </Link>
                        <a
                            href="https://github.com/silkchat/silkchat"
                            className="text-muted-foreground text-sm hover:text-foreground"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
