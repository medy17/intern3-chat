import { MagicCard } from "@/components/magic-cards"
import { Button } from "@/components/ui/button"
import { Link, createLazyFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

export const Route = createLazyFileRoute("/about")({
    component: RouteComponent
})

function RouteComponent() {
    const projects = [
        {
            title: "Speaktrum",
            image: "/projects/speaktrum/speaktrum.webp",
            blurb: "ML-powered companion platform for Parkinson's voice-marker research."
        },
        {
            title: "DropSilk",
            image: "/projects/dropsilk/SSIV2.webp",
            blurb: "Peer-to-peer file transfer with a privacy-first, direct-device workflow."
        },
        {
            title: "QBitWebUI",
            image: "/projects/qbitwebui/qbitwebui_logo.webp",
            blurb: "Modern interface for managing qBittorrent instances across environments."
        },
        {
            title: "Spyder-Scribe",
            image: "/projects/ss/ss.webp",
            blurb: "In-place web translation product with SaaS-backed PDF and image support."
        },
        {
            title: "Gossamer",
            image: "/projects/gossamer/gossamer.webp",
            blurb: "Story-based telemetry library that groups events into meaningful narratives."
        },
        {
            title: "CloneReaper Prime",
            image: "/projects/crp/crp-ascii.webp",
            blurb: "High-performance duplicate file scanner with safe cleanup tooling."
        },
        {
            title: "Imgur Archive Viewer",
            image: "/projects/iav/iav.webp",
            blurb: "Desktop utility for recovering media via the Internet Archive."
        },
        {
            title: "Bandar Breakdowns",
            image: "/projects/tbb/tbb.webp",
            blurb: "Personal writing and storytelling site about student life and culture."
        },
        {
            title: "Spyder-Scribe Community Edition",
            image: "/projects/ss-ce/ss.webp",
            blurb: "Open-source browser extension for high-quality in-page AI translation."
        },
        {
            title: "Sorting Visualizer",
            image: "/projects/sav/sav.webp",
            blurb: "Interactive algorithm visualizer with synchronized visual and audio feedback."
        }
    ]

    return (
        <div className="flex h-screen flex-col overflow-y-auto bg-background">
            <div className="container mx-auto px-4 py-12 md:py-24 lg:max-w-4xl">
                {/* Header with back button */}
                <div className="mb-6 flex items-center gap-4">
                    <Link to="/">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                    </Link>
                </div>

                {/* Header Section */}
                <div className="mb-16 text-center">
                    <h1 className="mb-6 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text font-bold text-5xl text-transparent lg:text-7xl">
                        About the Author
                    </h1>
                    <p className="mx-auto max-w-3xl text-muted-foreground text-xl leading-relaxed">
                        A quick intro to the mind behind SilkChat.
                    </p>
                </div>

                <MagicCard
                    className="mb-16 rounded-lg p-0"
                    gradientFrom="#06b6d4"
                    gradientTo="#3b82f6"
                    gradientSize={420}
                    gradientOpacity={0.1}
                >
                    <div className="flex flex-col gap-8 p-8 md:flex-row md:items-start md:p-12">
                        <img
                            src="/authors/ahmed-arat.webp"
                            alt="Ahmed Arat"
                            className="mx-auto h-40 w-40 rounded-2xl object-cover md:mx-0"
                        />
                        <div className="space-y-4 text-base text-muted-foreground leading-relaxed md:text-lg">
                            <p>
                                I&apos;m Ahmed Arat, a Full-Stack Developer based in Kuala Lumpur.
                            </p>
                            <p>I specialise in creating unique and beautiful looking interfaces.</p>
                            <p>
                                From translation tools to file transfer platforms, my philosophy
                                remains the same: make it accessible, performant, and delight the
                                user.
                            </p>
                            <p>
                                I&apos;m committed to continuous learning and improvement and while
                                that may at times manifest as my well known affinity for
                                over-engineered solutions, I believe that&apos;s the spark that
                                makes a product particularly enticing to users :)
                            </p>
                        </div>
                    </div>
                </MagicCard>

                {/* My Other Projects */}
                <MagicCard
                    className="mb-8 rounded-lg p-0"
                    gradientFrom="#9E7AFF"
                    gradientTo="#FE8BBB"
                    gradientSize={400}
                    gradientOpacity={0.08}
                >
                    <div className="p-8 md:p-12">
                        <h2 className="mb-3 text-center font-bold text-3xl lg:text-4xl">
                            My Other Projects
                        </h2>
                        <p className="mx-auto mb-8 max-w-3xl text-center text-lg text-muted-foreground leading-relaxed">
                            A few things I&apos;ve built across research, open source, SaaS, and
                            personal experiments.
                        </p>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {projects.map((project) => (
                                <div
                                    key={project.title}
                                    className="rounded-xl border border-border/60 bg-background/40 p-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <img
                                            src={project.image}
                                            alt={project.title}
                                            className="h-12 w-12 rounded-md border border-border/60 object-cover"
                                        />
                                        <div className="space-y-1">
                                            <p className="font-semibold text-sm md:text-base">
                                                {project.title}
                                            </p>
                                            <p className="text-muted-foreground text-xs leading-relaxed md:text-sm">
                                                {project.blurb}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </MagicCard>

                {/* Tech Stack Section */}
                <MagicCard
                    className="rounded-lg p-0"
                    gradientFrom="#10b981"
                    gradientTo="#06b6d4"
                    gradientSize={400}
                    gradientOpacity={0.08}
                >
                    <div className="p-12 text-center">
                        <h2 className="mb-6 font-bold text-3xl lg:text-4xl">Tech Stack</h2>
                        <p className="mx-auto mb-8 max-w-3xl text-lg text-muted-foreground leading-relaxed">
                            Built with modern tools and technologies to deliver the best developer
                            and user experience.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Tanstack Start</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">React</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">TypeScript</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Convex</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">TailwindCSS</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Better Auth</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Framer Motion</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">AI SDK</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Vite</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">PostgreSQL</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Drizzle ORM</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">shadcn-ui</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">tweakcn</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">BiomeJS</span>
                            </div>
                            <div className="rounded-full bg-foreground/5 px-4 py-2">
                                <span className="font-medium text-sm">Bun</span>
                            </div>
                        </div>
                    </div>
                </MagicCard>
            </div>
        </div>
    )
}
